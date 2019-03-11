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
var mime = require("mime");

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

  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function checkParseExtensions(extension) {
    return options.parseExtensions == "any" || extension in parseExtensionsObject;
  }

  function processFile(filePath, file) {
    if (options.parse) {
      if (checkParseExtensions(path.extname(filePath))) {
        // Immediately return cached file if found
        if (options.cacheParsed && cacheParsed[filePath]) {
          return cacheParsed[filePath];
        }

        // Parse file
        var matchFile;
        file = file.toString().replace(new RegExp(options.tagsEscaped[0] + ".*" + options.tagsEscaped[1], "g"), function (match) {
          // Remove tags
          match = match.substring(options.tags[0].length, match.length - (options.tags[0].length - 1));
          // Trim
          match = match.trim();
          // Hash if needed
          if (match.includes(options.tags[2])) {
            matchFile = path.join(staticPath, match.replace(new RegExp(options.tagsEscaped[2]), "."));
            match = match.replace(new RegExp(options.tagsEscaped[2]), "." + md5(fs.readFileSync(matchFile)).substring(0, options.hashLength) + ".");
          } else {
            // Treat as data 
            match = typeof options.data[match] === "function" ? options.data[match]() : options.data[match];
          }
          return match;
        });

        // Cache parse d file if needed
        if (options.cacheParsed && !cacheParsed[filePath]) {
          cacheParsed[filePath] = file;
        }
      }
    }
    return file;
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
      try {

        // Sanitize URL to avoid Directory Traversal Attack
        var parsedUrl = url.parse(req.url);
        var sanitizePath = path.normalize(parsedUrl.pathname).replace(/^(\.\.[\/\\])+/, "");
        var filePath = path.join(staticPath, sanitizePath);

        // Ensure child of staticPath to avoid Directory Traversal Attack
        if (path.resolve(filePath).startsWith(staticPath)) {

          // Serve file if exists
          if (fs.existsSync(filePath)) {

            // Support directory without index.html
            if (fs.statSync(filePath).isDirectory()) {
              filePath += "/index.html";
            }

            // Deal with cached files to reduce I/O
            var file;

            if (options.cache) {
              if (!cache[filePath]) {
                cache[filePath] = fs.readFileSync(filePath);
              }
              file = cache[filePath];
            } else {
              file = fs.readFileSync(filePath);
            }

            // Parse File   
            options.beforeParse ? file = options.beforeParse(filePath, file) : null;
            var payload = processFile(filePath, file);
            options.afterParse ? payload = options.afterParse(filePath, payload) : null;

            // Send file
            options.beforeSend ? options.beforeSend(req, res, next) : null;
            res.setHeader("Content-Type", mime.getType(filePath));
            res.send(payload);
            options.afterSend ? options.afterSend(req, res, next) : null;

          } else {
            next();
          }

        } else {
          next();
        }

      } catch (error) {
        if (options.debug) {
          throw error;
        }
        next();
      }
    });
  }


  return router;
};