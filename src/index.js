// --- TODO ---
// Mimic all express static API
// Add glob support for include and exclude for parsed and cache files
// Support Koa

var express = require("express");
var router = express.Router();
var md5 = require("md5");
var fs = require("fs");
var path = require("path");
var url = require("url");
var querystring = require("querystring");
var mime = require("mime");
var util = require("util");

var readFile = util.promisify(fs.readFile);
var exists = util.promisify(fs.exists);
var stat = util.promisify(fs.stat);

module.exports = function (staticPath, options) {

  var cache = {};
  var cacheParsed = {};

  options = options || {};
  options.debug = "debug" in options ? options.debug : false;
  options.tags = options.tags || ["@{", "}", ".hash."];
  options.data = options.data || {};
  options.cache = "cache" in options ? options.cache : false;
  options.cacheParsed = "cacheParsed" in options ? options.cacheParsed : false;
  options.parse = "parse" in options ? options.parse : false;
  options.hash = "hash" in options ? options.hash : false;
  options.hashLength = "hashLength" in options ? options.hashLength : 7;
  options.parseExtensions = options.parseExtensions || [
    "html",
    "css",
    "js"
  ];
  options.hashExtensions = options.hashExtensions || "any";

  // Initialize hashExtensionsRegex and parseExtensionsObject
  var hashExtensionsRegex = options.hashExtensions == "any" ? ".+" : options.hashExtensions.join("|");
  var parseExtensionsObject = {};

  if (Array.isArray(options.parseExtensions)) {
    options.parseExtensions.forEach(function (value) {
      parseExtensionsObject["." + value] = true;
    });
  }

  // Escape tags for regex use
  options.tagsEscaped = {};
  options.tags.forEach(function (value, index) {
    options.tagsEscaped[index] = escapeRegExp(value);
  });

  function asyncReplace(str, re, replacer) {
    return Promise.resolve().then(() => {
      var fns = []
      str.replace(re, (m, ...args) => {
        fns.push(replacer(m, ...args))
        return m
      });
      return Promise.all(fns).then(replacements => {
        return str.replace(re, () => replacements.shift())
      });
    });
  }

  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function checkParseExtensions(extension) {
    return options.parseExtensions == "any" || extension in parseExtensionsObject;
  }

  async function processFile(filePath, file) {
    if (options.parse && checkParseExtensions(path.extname(filePath))) {
      // Immediately return cached file if found
      if (options.cacheParsed && cacheParsed[filePath]) {
        return cacheParsed[filePath];
      }

      return new Promise(function (resolve, reject) {
        // Parse file
        var tagsRegex = new RegExp(options.tagsEscaped[0] + ".*" + options.tagsEscaped[1], "g");
        asyncReplace(file.toString(), tagsRegex, async function (match) {
          // Remove tags
          match = match.substring(options.tags[0].length, match.length - (options.tags[0].length - 1));
          // Trim
          match = match.trim();
          // Hash if needed
          if (match.includes(options.tags[2])) {
            matchFile = path.join(staticPath, match.replace(new RegExp(options.tagsEscaped[2]), "."));
            match = match.replace(new RegExp(options.tagsEscaped[2]), "." + md5(await readFile(matchFile)).substring(0, options.hashLength) + ".");
          } else {
            // Treat as data 
            match = typeof options.data[match] === "function" ? options.data[match]() : options.data[match];
          }

          return match;
        }).then(function (string) {
          file = string;
          // Cache parse d file if needed
          if (options.cacheParsed && !cacheParsed[filePath]) {
            cacheParsed[filePath] = file;
          }
          resolve(file);
        }).catch(function (error) {
          reject(error);
        });

      });
    }

    return new Promise(function (resolve, reject) {
      resolve(file);
    });
  }

  async function serveFile(req, res, next) {
    try {
      // Sanitize URL to avoid Directory Traversal Attack   
      var urlPath = url.parse(req.url).pathname;
      var sanitizePath = path.normalize(querystring.unescape(urlPath)).replace(/^(\.\.[\/\\])+/, "");
      var filePath = path.join(staticPath, sanitizePath);

      // Ensure child of staticPath to avoid Directory Traversal Attack
      if (path.resolve(filePath).startsWith(staticPath) && await exists(filePath)) {

        // Support directory without index.html
        if ((await stat(filePath)).isDirectory()) {
          filePath += "/index.html";
        }

        // Deal with cached files to reduce I/O
        var file;

        if (options.cache) {
          if (!cache[filePath]) {
            cache[filePath] = await readFile(filePath);
          }
          file = cache[filePath];
        } else {
          file = await readFile(filePath);
        }

        // Parse File   
        options.beforeParse ? file = options.beforeParse(filePath, file) : null;
        var payload = await processFile(filePath, file);
        options.afterParse ? payload = options.afterParse(filePath, payload) : null;

        // Send file
        options.beforeSend ? options.beforeSend(req, res, next) : null;
        res.setHeader("Content-Type", mime.getType(filePath));
        res.send(payload);
        options.afterSend ? options.afterSend(req, res, next) : null;

      } else {
        next();
      }

    } catch (error) {
      if (options.debug) {
        throw error;
      }
      next();
    }
  }

  if (staticPath) {

    if (options.hash) {
      router.get("*", function (req, res, next) {
        // Regular expression to replace the MD5 hash in the request URL with nothing
        req.url = req.url.replace(new RegExp("\\/([^\\/]+)\\.[0-9a-f]+\\.(" + hashExtensionsRegex + ")$"), "/$1.$2");
        next();
      });
    }

    // Serve parsed file
    router.get("*", function (req, res, next) {
      serveFile(req, res, next);
    });
  }


  return router;
};