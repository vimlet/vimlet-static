// TODO
// Mimic all express static API
// Customizable tags
// Cache
// Add glob support for include and exclude for processFile
// README.md
// Support Koa

var express = require("express");
var router = express.Router();
var md5 = require("md5");
var fs = require("fs");
var path = require("path");
var url = require("url");
var mime = require("mime");

module.exports = function (staticPath, options) {
  options = options || {};
  options.tags = options.tags || ["@{", "}", ".hash."];
  options.cache = "cache" in options ? options.cache : false;
  options.parseEnable = "hashEnable" in options ? options.parseEnable : true;
  options.hashEnable = "hashEnable" in options ? options.hashEnable : true;
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
  options.tags.forEach(function (value, index) {
    options.tags[index] = escapeRegExp(value);
  });

  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function checkParseExtensions(extension) {
    return options.parseExtensions == "any" || extension in parseExtensionsObject;
  }

  function processFile(filePath, file) {
    if (options.parseEnable) {
      if (checkParseExtensions(path.extname(filePath))) {
        var matchFile;
        file = file.toString().replace(new RegExp(options.tags[0] + ".*" + options.tags[1], "g"), function (match) {
          match = match.substring(2, match.length - 1);
          matchFile = path.join(staticPath, match.replace(new RegExp(options.tags[2]), "."));
          match = match.replace(new RegExp(options.tags[2]), "." + md5(fs.readFileSync(matchFile)).substring(0, options.hashLength) + ".");
          return match;
        });
      }
    }
    return file;
  }

  if (staticPath) {

    if (options.hashEnable) {
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

            // Parse File   
            var file = fs.readFileSync(filePath);
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
        next();
      }
    });
  }


  return router;
};