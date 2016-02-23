require('newrelic');
var express = require('express');
var app = express();

app.get('/version', function(req, res){
  res.send(process.env.SOURCE_VERSION);
});

app.use(express.static('public'));

app.listen(process.env.PORT, process.env.IP);

console.log('Server started.');