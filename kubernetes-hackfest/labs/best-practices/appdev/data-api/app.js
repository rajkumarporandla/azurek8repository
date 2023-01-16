const bodyParser = require('body-parser');
const createError = require('http-errors');
const dayjs = require('dayjs');
const express = require('express');
const logger = require('morgan');
const mongoose = require('mongoose');
const path = require('path');
const relativeTime = require('dayjs/plugin/relativeTime');

dayjs.extend(relativeTime);

global.start = dayjs().valueOf();

if (process.env.NODE_ENV != 'container') {
  require('dotenv').config({ path: path.join(__dirname, '.env.local') });
}

const appInsights = require('applicationinsights');

appInsights
  .setup()
  .setAutoDependencyCorrelation(false)
  .setAutoCollectRequests(true)
  .setAutoCollectPerformance(true)
  .setAutoCollectExceptions(true)
  .setAutoCollectDependencies(true)
  .setAutoCollectConsole(true)
  .setUseDiskRetryCaching(true)
  .start();

appInsights.defaultClient.commonProperties = {
    EnvName: `container`,
    EnvType: process.env.NODE_ENV
};

appInsights.defaultClient.config.maxBatchSize = 1;

mongoose.set('useCreateIndex', true);
mongoose.set('useFindAndModify', false);

require('./models/mongo/flights');
require('./models/mongo/latestFlight');
require('./models/mongo/quakes');
require('./models/mongo/latestQuake');
require('./models/mongo/weather');
require('./models/mongo/latestWeather');

mongoose.Promise = global.Promise;

const app = express();

var mongoPrefix = "mongodb://"
var user = process.env.MONGODB_USER
var password = process.env.MONGODB_PASSWORD

var cosmosConnectString = mongoPrefix.concat(user,`:`,password,`@`,user,`.documents.azure.com:10255/hackfest?ssl=true`)

mongoose.connect(
  cosmosConnectString,
  {
    user: user,
    pass: password,
    useNewUrlParser: true
  }
)
.then (() => {
  appInsights.defaultClient.trackEvent({ name: 'MongoConnSuccess' });
  console.log('connection success with CosmosDB');
})
.catch ((err) => {
  appInsights.defaultClient.trackException({exception: new Error(err)});
  console.log('CosmosDB connection failed with error: ' + err);
  appInsights.defaultClient.flush({callback: (responseFromAppInsights) => {
    process.exit(-1);
  }});
});

const apiRouter = require('./routes/api');

app.set('etag', 'strong');
app.use(logger('dev'));
app.use(bodyParser.json({ limit: '2mb' }));
app.use('/', apiRouter);

app.use(function(req, res, next) {
  next(createError(404));
});

app.use(function(req, res, next) {
  if (req.method === 'GET' || req.method === 'POST') {
    appInsights.defaultClient.trackNodeHttpRequest({
      request: req,
      response: res
    });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, OPTIONS, PUT, PATCH, DELETE'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-Requested-With,content-type'
  );

  res.append('Last-Modified', new Date().toUTCString());

  next();
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.send(err);
});

module.exports = app;