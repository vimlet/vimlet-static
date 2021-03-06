var path = require("path");
var express = require("express");
var app = express();

// Default config
var port = 80;
var staticPath = path.join(__dirname, "webapp");

// Serve static content
app.use(require("../src/index.js")(staticPath, {
  // debug: true,
  parse: true,
  hash: true,
  // cache: true,
  // cacheParsed: true,
  data: {
    "text": "I'm injected data, so cool!",
    "date": function() {
      return new Date();
    }
  },
  afterParse: function (filePath, file) {
    return file.toString() + "\n<!-- I was dynamically added! -->";
  },
  beforeSend: function (req, res, next) {
    // res.send("Hijacked!");
    next();
  }
}));

// HTTP server
var serverHttp = app.listen(port, function () {
  console.log("Main server listening at http://localhost:" + port);
});