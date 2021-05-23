/*!
 * express
 * Copyright(c) 2009-2013 TJ Holowaychuk
 * Copyright(c) 2013 Roman Shtylman
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict';

/**
 * Module dependencies.
 */

var bodyParser = require('body-parser')
var EventEmitter = require('events').EventEmitter;
var mixin = require('merge-descriptors');
var proto = require('./application');
var Route = require('./router/route');
var Router = require('./router');
var req = require('./request');
var res = require('./response');

/**
 * Expose `createApplication()`.
 */
// 导出 createApplication，也就是说在外面使用
// require('express') 的时候，导入的实际上是 createApplication 这个函数对象
exports = module.exports = createApplication;

/**
 * Create an express application.
 *
 * @return {Function}
 * @api public
 */

/**
 * 外部使用方式：
 *   const express = require('express')
 *   const app = express()
 *   app.get('/info', (req, res, next) => {
 *     res.end('success')
 *   })
 *   app.listen(9000, () => {
 *     console.log('服务器开启: 0.0.0.0:9000');
 *   })
 * 
 * 
 * @returns app 函数
 */
function createApplication() {
  // 定义了一个 app 函数
  var app = function(req, res, next) {
    app.handle(req, res, next);
  };

  // 通过对象合并的方式，往 app 上挂载一系列方法，mixin 实用了 merge-descriptors 这个库的能力
  // 往 app 上混入 EventEmitter.prototype 上的属性和方法
  mixin(app, EventEmitter.prototype, false);
  // 往 app 上混入 application.js 里面定义的方法
  mixin(app, proto, false);

  // expose the prototype that will get set on requests
  // 将 Node 的 http.IncomingMessage 类放到 app.request 上
  // req 实际上是 req = Object.create(http.IncomingMessage.prototype)
  // 也就是说 app.request 的核心还是 Node 的 http 的 request 实例
  // 但是 express 往 req 上拓展了不少功能，例如： res.param 等，具体可以看 request.js 文件
  app.request = Object.create(req, {
    app: { configurable: true, enumerable: true, writable: true, value: app }
  })

  // expose the prototype that will get set on responses
  // 将 Node 的 http.ServerResponse 类放到 app.response 上
  // res 实际上是 res = Object.create(http.ServerResponse.prototype)
  // 也就是说 app.response 的核心还是 Node 的 http 的 response 实例
  // 但是 express 往 res 上拓展了不少功能，例如： res.send 等，具体可以看 response.js 文件
  app.response = Object.create(res, {
    app: { configurable: true, enumerable: true, writable: true, value: app }
  })

  // 调用 app.init 进行初始化
  // 这个 init 函数是什么时候被挂载上去的？就是在 mixin(app, proto, false) 的时候
  // proto 其实就是通过 require('./application') 引进来的
  // application 这个里面定义了一系列往 app 上挂载的方法
  app.init();

  // 最后将定义的 app 函数返回
  return app;
}

/**
 * Expose the prototypes.
 */

exports.application = proto;
exports.request = req;
exports.response = res;

/**
 * Expose constructors.
 */

exports.Route = Route;
exports.Router = Router;

/**
 * Expose middleware
 */
// 上面有 exports = module.exports = createApplication
// 所以往 exports 上加东西实际上就是往 createApplication 中加东西
// 暴露一些内置的 express 中间件
// 使用 body-parser 库的 json 处理 body 是 application/json 格式的
exports.json = bodyParser.json
// 处理 url 的 query 参数，例如： http://127.0.0.1:9000/info?name=jack
exports.query = require('./middleware/query');
// 使用 body-parser 库的 raw 处理 body 是 raw 格式
exports.raw = bodyParser.raw
// 使用 serve-static 库作为 express 开启静态资源服务器的能力
exports.static = require('serve-static');
// 使用 body-parser 库的 text 处理 body 是 tetx 格式
exports.text = bodyParser.text
// 使用 body-parser 库的 urlencoded 处理 body 是 x-www-form-urlencoded 格式
exports.urlencoded = bodyParser.urlencoded

/**
 * Replace removed middleware with an appropriate error message.
 */
// 以下这些中间件已经从 express 内部移除成单独的中间件库，不再支持通过 express.xxx 的方式使用
// 如果需要使用相关功能，会提示需要安装对应的库
var removedMiddlewares = [
  'bodyParser',
  'compress',
  'cookieSession',
  'session',
  'logger',
  'cookieParser',
  'favicon',
  'responseTime',
  'errorHandler',
  'timeout',
  'methodOverride',
  'vhost',
  'csrf',
  'directory',
  'limit',
  'multipart',
  'staticCache'
]

removedMiddlewares.forEach(function (name) {
  Object.defineProperty(exports, name, {
    get: function () {
      throw new Error('Most middleware (like ' + name + ') is no longer bundled with Express and must be installed separately. Please see https://github.com/senchalabs/connect#middleware.');
    },
    configurable: true
  });
});
