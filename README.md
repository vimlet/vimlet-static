# vimlet-static

## Installation:
```
$ npm install @vimlet/server-static --save
```

## Usage:
```
var path = require("path");
var express = require("express");
var static = require("@vimlet/server-static");

var app = express();
 
app.use(static(path.join(__dirname, "public")));
 
const server = app.listen(3000, function(){
  console.log("server is running at %s", server.address().port);
});
```

## Advance Usage:

You can pass an option argument to enable advance capabilities such as hooks, data parsing and file hashing.

```
var options =  {
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
  };
}

app.use(static(path.join(__dirname, "public")), options); 
```

## Parsing: (Only if enabled)

You can use special tags (by default "@{" and "}") to inject data before the file is served.
If you include hash special tag (by default ".hash." inside the parsing tags it will be treated as a url and .hash. will be replaced by the hash of that file.

```
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Page Title</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script src="@{test.hash.js}"></script> 
</head>
<body>
  Hello World! @{text} 
  <br> Today is @{date}  
</body>
</html>
```

This will become:

```
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Page Title</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script src="test.fa7e4d1.js"></script>
</head>
<body>
  Hello World! I'm injected data, so cool! 
  <br> Today is Mon Mar 11 2019 15:20:17 GMT+0100 (GMT+01:00)  
</body>
</html>
<!-- I was dynamically added! -->
```

## Hash:

Note that when parsing hashed files, the actual file will not exist. To fix this when hash option is set to true, the request will be re-routed the real file by omitting the hash part.

## Options:

### debug 
Description: If true, it will throw on error. 

Default: false

## parse
Description: If true, it will parse files allowing the interpolation of data.
It's useful for things like file hashing.

Default: false

### parseExtensions
Description: Array or "any" to allow choosing which files will be parsed.

Default: ["html", "css", "js"]

### tags
Description: Array to allow custom tags for parsing.

Default: ["@{", "}", ".hash."]

### data
Description: Object used when parsing for interpolation. A function can be provided as a value with a return statement to allow dynamic data.

Default: {}

### cache
Description: If true, it will cache readFile to reduce I/O operations on disk. It's recommend for production environments.

Default: false

### cacheParsed
Description: If true, it will cache parsed output to reduce CPU usage. Note this will affect things like dynamic data which will only run once.

### hash
Description: If true, it will remove the hash part from GET requests with the following format. /url.hash.extension

Default: false

### hashLength
Description: Will set the length of the hash when parsing hash interpolations.

Default: 7

### hashExtensions 
Description: Array or "any" to allow choosing which files will filter hash.

default: "any"

### beforeParse
Description: Hook function before parsing is done.

function (filePath, file) { return file.toString(); }

### afterParse
Description: Hook function after parsing is done.

function (filePath, payload) { return payload; }

### beforeSend 
Description: Hook function before payload is sent.

function (req, res, next) { next(); };

###  afterSend
Description: Hook function after payload is sent.

function (req, res, next) { next(); };