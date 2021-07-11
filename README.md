# Express 源码阅读

当前阅读的 Express 版本：4.17.1。基本源码目录：

```
Express
├── benchmarks                  基准相关
├── examples                    案例代码
├── lib                         express 核心源码目录
│   ├── middleware              中间件相关
│   │   ├── init.js             将新增加在 req 和 res 的功能挂载到原始请求的 req 和 res 的原型上
│   │   └── query.js            将请求 url 中的 query 部分添加到 req.query
│   ├── router                  路由相关(核心)
│   │   ├── index.js            
│   │   ├── layer.js            
│   │   └── route.js            
│   ├── application.js          创建 express 应用后可直接调用的 api 均在此处（核心）
│   ├── express.js              创建 express 应用
│   ├── request.js              丰富了 http 中 request 实例的功能
│   ├── response.js             丰富了 http 中 response 实例的功能
│   ├── utils.js                一些辅助工具函数
│   ├── view.js                 封装了模板渲染引擎，通过 res.render() 调用引擎渲染网页
├── test                        单元测试
├── index.js                    require('express') 的入口
```

整体上，express 的源码目录是相对简单的，核心源码在 lib 目录下



## 1、入口

先从入口开始，当执行：`const express = require('express')` 的时候，会取到 express 源码的根目录，找到 index.js 文件

> express\index.js

```js
module.exports = require('./lib/express');
```

这个文件就只有简单的一行有意义的代码，就是将 `./lib/express` 引入并导出



再看看，`./lib/express.js` 中导出了什么

> express\lib\express.js

```js
// ...

exports = module.exports = createApplication;

function createApplication() {/.../}
```

`./lib/express.js` 里面实际上就是导出了 createApplication 函数

也就是说，我们通过 `require('express')` 引进来的实际上就是 `createApplication` 函数对象



到此，入口结束，下面来看看 `createApplication` 这个函数对象



## 2、createApplication 得到 app 函数对象

先来看一段使用例子：

```js
const express = require('express')

const app = express()
```



上一节入口分析得到，`require('express')` 得到的就是 `createApplication` 函数对象

> express\lib\express.js

```js
var EventEmitter = require('events').EventEmitter;
var mixin = require('merge-descriptors');
var proto = require('./application');
var req = require('./request');
var res = require('./response');


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

  // 将 Node 的 http.IncomingMessage 类放到 app.request 上
  // req 实际上是 req = Object.create(http.IncomingMessage.prototype)
  // 也就是说 app.request 的核心还是 Node 的 http 的 request 实例
  // 但是 express 往 req 上拓展了不少功能，例如： res.param 等，具体可以看 request.js 文件
  app.request = Object.create(req, {
    app: { configurable: true, enumerable: true, writable: true, value: app }
  })

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
```

createApplication 做的事：

- 定义了一个 app 函数

- 通过 mixin 往 app 函数对象上混入一系列方法

- 将 Node 的 http 模块的 request、response 实例分别挂在到 app.request 和 app.response 上

- 调用在 mixin 阶段混入的 app.init 进行初始化

  ```js
  app.init = function init() {
    this.cache = {};
    this.engines = {};
    this.settings = {};
  
    this.defaultConfiguration();
  };
  ```

- 将 app 函数对象返回



所以，`const app = express()` 得到的这个 app 对象实际上就是 createApplication 里面定义的 app 函数对象



## 3、app.listen 干了什么

使用 express 开启服务器最主要的三步：

```js
const express = require('express')

const app = express()

app.listen(9000, () => {
  console.log('服务器开启: 0.0.0.0:9000');
})
```

第三步就是： app.listen



通过上一节知道，app 实际上就是 createApplication 里面定义的 app 函数对象，而在 app 的 listen 方法其实是在 mixin 往 app 混入方法的时候挂载到 app 上的，这些**混入的方法基本都定义在 application.js 里面**：

> express\lib\express.js

```js
var mixin = require('merge-descriptors');
var proto = require('./application');

function createApplication() {
  var app = function(req, res, next) {
    app.handle(req, res, next);
  };

  mixin(app, proto, false);
  // ...
}
```



接下来看看 app.listen 被定义的地方：

> express\lib\application.js

```js
var http = require('http');

// 定义 app 函数对象上的 listen 方法
// 实际上还是通过 Node 的 http 模块开启服务
app.listen = function listen() {
  // 通过 Node 的 http.createServer 创建一个服务
  // 这里的 this 就是 app 函数对象本身
  var server = http.createServer(this);
  // 开启这个服务
  return server.listen.apply(server, arguments);
};
```

app.listen 其实很简单，就是依赖于 Node 原生的 http 模块开启一个服务，比如 Node 开启服务的代码：

```js
const http = require('http')

// 创建一个服务器
const server = http.createServer((req, res) => {
  res.end('server success')
})

// 启动服务器，指定端口号和主机地址
server.listen(9000, () => {
  console.log(`服务器已启动：0.0.0.0:9000`)
})
```

这一看，其实就完全对上了，app.listen 主要作用：

- 首先，通过 http.createServer 创建一个服务 server，创建这个服务需要一个回调函数作为参数，这里传的是 this，实际上就是 app 函数本身

  ```js
  function createApplication() {
    var app = function(req, res, next) {
      app.handle(req, res, next);
    }
  }
  ```

  也就是说后续需要执行这个回调的时候，实际上执行的就是 app 函数里面的 app.handle 函数

- 通过 server.listen 开启服务，这里会通过 apply 的方式将参数传进来



## 4、app.use 干了什么

先来看一段实例代码：

```js
const express = require('express')

const app = express()

const myMiddleFun = (req, res, next) => {
  console.log('中间件')
  next()
}
app.use(myMiddleFun)

app.listen(9000, () => {
  console.log('服务器启动: 0.0.0.0:9000')
})
```



接下来看看 app.use 函数：

> express\lib\application.js

```js
// app.use 的使用形式
//  1、app.use((req, res, next) => {}) // 只传了中间件函数
//  2、app.use('/', (req, res, next) => {}) // 传了路径和中间件函数
//  3、app.use('/',(req, res, next) => {},(req, res, next) => {},...) // 连续注册多个中间件
app.use = function use(fn) {
  var offset = 0; // 定义偏移量
  var path = '/'; // 定义路径，默认为 '/'

  // fn 代表使用 app.use 传进来的第一位参数
  // 如果 fn 不是函数形式，那么就是 app.use('/', (req, res, next) => {})
  if (typeof fn !== 'function') {
    // 将第一位参数给 arg
    var arg = fn;

    // 如果是数组，取出第一位
    while (Array.isArray(arg) && arg.length !== 0) {
      arg = arg[0];
    }

    // first arg is the path
    if (typeof arg !== 'function') {
      offset = 1; // offset 偏移量赋值为 1
      path = fn; // 将路径赋值给 path
    }
  }

  // 将参数 arguments 从 offset 偏移量后开始切割得到中间件函数数组
  //  offset：如果第一位参数传的是路径，那么 offset=1，代表 arguments 从 1 之后的才是中间件函数
  //          否则，offset=0
  // flatten 的作用是扁平化数组
  // app.use('/', (req, res, next) => {}, (req, res, next) => {}, ...)
  var fns = flatten(slice.call(arguments, offset));

  // fns 长度为 0，说明没有传入中间件函数，报错
  if (fns.length === 0) {
    throw new TypeError('app.use() requires a middleware function')
  }

  // 主要就是通过 new Router 创建了 Router 实例挂载到 app._router 上
  this.lazyrouter();
  // 从 app._router 上取出 Router 实例
  var router = this._router;

  // 遍历中间件函数数组
  fns.forEach(function (fn) {
    // non-express app
    // 从这里可以看出，实际上 app.use 是调用 router.use 进行中间件注册
    // 第一次的时候，中间件的回调函数一般都没有 handle 和 set，即 fn.handle 和 fn.set 为 undefined
    if (!fn || !fn.handle || !fn.set) {
      return router.use(path, fn);
    }

    //...

  }, this);

  // this 就是 app 函数对象，将 this 返回使得支持链式调用
  return this;
};
```



**总结：**app.use 里面最核心的就是调用了 router.use，也就是说，app.use 只是 router.use 的一层包装，它的本质还是 router.use



## 5、router.use

### 5.1、new Router 创建 router 实例

在说 router 之前，得先了解 router 是怎么的来的，回到之前的 `app.use = function use(fn) {} `，创建 router 的是：

> express\lib\application.js

```js
app.use = function use(fn) {
  // ...

  // 主要就是通过 new Router 创建了 Router 实例挂载到 app._router 上
  this.lazyrouter();
  // 从 app._router 上取出 Router 实例
  var router = this._router;
    
    // 遍历中间件函数数组
  fns.forEach(function (fn) {
    // non-express app
    // 从这里可以看出，实际上 app.use 是调用 router.use 进行中间件注册
    // 第一次的时候，中间件的回调函数一般都没有 handle 和 set，即 fn.handle 和 fn.set 为 undefined
    if (!fn || !fn.handle || !fn.set) {
      return router.use(path, fn);
    }

    //...

  }, this);
};
```

首先，可以知道 router 来自于 `app._router`，那么 `app._router` 又是什么时候被赋值的呢？答案在 `this.lazyrouter()` 中

来看看 `app.lazyrouter()` 所做的事：

> express\lib\application.js

```js
var Router = require('./router');

app.lazyrouter = function lazyrouter() {
  // 如果 app 上没有 _router
  if (!this._router) {
    // 创建一个 Router 实例挂载到 app 上
    this._router = new Router({
      caseSensitive: this.enabled('case sensitive routing'),
      strict: this.enabled('strict routing')
    });

    this._router.use(query(this.get('query parser fn')));
    this._router.use(middleware.init(this));
  }
}
```

可以发现，app._router 是通过 new Router 得到的实例，而 Router 是通过 `var Router = require('./router/index.js')` 得到



接下来看看 `router\index.js` ，这个模块里面导出的是：

> express\lib\router\index.js

```js
var proto = module.exports = function(options) {
  var opts = options || {};

  // 定义 router 函数对象
  function router(req, res, next) {
    router.handle(req, res, next);
  }

  // mixin Router class functions
  // 往 router 实例上混入一系列方法，这些方法定义在 proto 上
  setPrototypeOf(router, proto)

  // 继续往 router 函数对象上挂载一些其他属性
  router.params = {};
  router._params = [];
  router.caseSensitive = opts.caseSensitive;
  router.mergeParams = opts.mergeParams;
  router.strict = opts.strict;
  // 定义 stack 用于存储中间件
  router.stack = [];

  // 返回 router，在 new Router 后得到的就是这个 router 函数
  return router;
}
```

- 定义了 router 函数
- 通过 ` setPrototypeOf(router, proto)` 往 router 上混入定义在 proto 上的一些方法
- 继续混入其他属性，例如 router.params 、router.stack 等
- 最后将 router 函数返回

也就是说，new Router 的到的是返回的 router 函数，而 router.use 毫无疑问，就是在

setPrototypeOf(router, proto) 时混入到 router 中的



### 5.2、创建 router.use 函数

> express\lib\router\index.js

```js
// router.use 是在这里定义的
// 这里需要注意的是 this 指向的问题，如果是执行 router.use，那么此时 this 指向的是 router
// router.use 的使用形式
//  1、router.use((req, res, next) => {}) // 只传了中间件函数
//  2、router.use('/', (req, res, next) => {}) // 传了路径和中间件函数
//  3、router.use('/', (req, res, next) => {}, (req, res, next) => {}, ...) // 连续注册多个中间件
proto.use = function use(fn) {
  var offset = 0; // 偏移量
  var path = '/'; // 路径

  // 如果 fn 不是函数形式，那么就是 router.use('/', (req, res, next) => {})
  if (typeof fn !== 'function') {
    // 将第一位参数给 arg
    var arg = fn;

    // 如果是数组，取出第一位
    while (Array.isArray(arg) && arg.length !== 0) {
      arg = arg[0];
    }

    if (typeof arg !== 'function') {
      offset = 1; // offset 偏移量赋值为 1
      path = fn; // 将路径赋值给 path
    }
  }

  // 将参数 arguments 从 offset 偏移量后开始切割得到中间件函数数组
  //  offset：如果第一位参数传的是路径，那么 offset=1，代表 arguments 从 1 之后的才是中间件函数
  //          否则，offset=0
  // flatten 的作用是扁平化数组
  // router.use('/', (req, res, next) => {}, (req, res, next) => {}, ...)
  var callbacks = flatten(slice.call(arguments, offset));

  // callbacks 长度为 0，说明没有传入中间件函数，报错
  if (callbacks.length === 0) {
    throw new TypeError('Router.use() requires a middleware function')
  }

  // 遍历中间件函数数组
  for (var i = 0; i < callbacks.length; i++) {
    var fn = callbacks[i];

    // 中间件不是函数形式，报错
    if (typeof fn !== 'function') {
      throw new TypeError('Router.use() requires a middleware function but got a ' + gettype(fn))
    }

    // add the middleware
    debug('use %o %s', path, fn.name || '<anonymous>')

    // 实例化 Layer，并将 路径、中间件函数fn 以及一些其他参数传进去
    // new Layer 时会将 中间件函数fn 挂载到实例 layer.handle 上
    var layer = new Layer(path, {
      sensitive: this.caseSensitive,
      strict: false,
      end: false
    }, fn);

    // 设置 
    layer.route = undefined;

    // 这里的 this 实际上是 router
    // 就是将 layer 实例存到 router.stack 数组
    // 当后面需要使用到中间件函数时，同 router.stack 中逐一取出 layer 实例，执行实例的 handle
    this.stack.push(layer);
  }

  // 将 router 返回，用于链式调用
  return this;
};
```

- 前面的参数处理过程与 app.use 一样
- 得到中间件数组后，遍历数组
- 将 path 路径，中间件函数fn 当做 new Layer 的参数，得到实例 layer
- 将实例 layer 添加到 router.stack 数组（后面需要执行中间件函数的时候，再把这些实例从 stack 中逐一取出来）



### 5.3、new Layer

接下来看看 `new Layer ` 做的事

> express\lib\router\layer.js

```js
// Layer 构造函数
function Layer(path, options, fn) {
  if (!(this instanceof Layer)) {
    return new Layer(path, options, fn);
  }

  debug('new %o', path)
  var opts = options || {};

  // 将 new Layer 传进来的中间件函数 fn 挂载到 Layer.handle
  this.handle = fn;
  this.name = fn.name || '<anonymous>';
  this.params = undefined;
  this.path = undefined;
  this.regexp = pathRegexp(path, this.keys = [], opts);

  // set fast path flags
  this.regexp.fast_star = path === '*'
  this.regexp.fast_slash = path === '/' && opts.end === false
}
```

可以看出，new Layer 得到的实例 layer 会有一些属性，其中比较重要的就是 layer.handle，这上面是挂载了当前的中间件函数



### 5.4、总结

router.use 最主要的就是：

- 通过 new Layer 实例化的形式，往将`中间件函数`挂到 layer 实例的 handle 属性身上，每一个`中间件函数`都会有一个 layer 实例去保存
- 将保存有`中间件函数` 的 layer 实例放进 stack 数组



## 6、中间件函数调用时机

中间件调用的时机，也就是请求被处理的阶段，基本流程如下：



### 6.1、外部访问服务，触发 http.createServer 的回调

在 Node 中：

```js
const http = require('http')

// 创建一个服务器
const server = http.createServer((req, res) => {
  res.end('server success')
})

// 启动服务器，指定端口号和主机地址
server.listen(9000, () => {
  console.log(`服务器已启动：0.0.0.0:9000`)
})
```

当外部访问 `0.0.0.0:9000` 的时候，会触发 `http.createServer` 的回调函数 `(req, res) => {}`



而 express 中，调用 `http.createServer` 的地方上面已经说过，就是在 app.listen 中

> express\lib\application.js

```js
// 定义 app 函数对象上的 listen 方法
// 实际上还是通过 Node 的 http 模块开启服务
app.listen = function listen() {
  // 通过 Node 的 http.createServer 创建一个服务
  // 这里的 this 就是 app 函数对象本身
  var server = http.createServer(this);
  // 开启这个服务
  return server.listen.apply(server, arguments);
};
```

而这里 `http.createServer` 的回调函数是 this，也就是 app 函数本身，再看回 app 函数：

> express\lib\express.js

```js
function createApplication() {
  // 定义了一个 app 函数
  var app = function(req, res, next) {
    app.handle(req, res, next);
  };

  //...
    
  return app
}
```

也就是说，外部访问触发的回调是 app 函数，执行 app 函数实际上是执行 app.handle 函数



### 6.2、app.handle

> express\lib\application.js

```js
// 外部访问服务，触发 app 函数调用，app 函数实际是调用 app.handle
app.handle = function handle(req, res, callback) {
  // 取到 router 实例
  var router = this._router;

  //...

  // app.handle 实际上是调用的 router.handle 方法
  router.handle(req, res, done);
}
```

app.handle 的核心是执行 router.handle 函数



### 6.3、router.handle

> express\lib\router\index.js

```js
// 定义 router.handle
proto.handle = function handle(req, res, out) {
  // 将 router 实例保存在 self 上
  var self = this;

  debug('dispatching %s %s', req.method, req.url);

  var idx = 0; // 索引
  var protohost = getProtohost(req.url) || ''
  var removed = '';
  var slashAdded = false;
  var paramcalled = {};

  // store options for OPTIONS request
  // only used if OPTIONS request
  var options = [];

  // middleware and routes
  // 拿到 router 中存放 layer 实例的数组
  // layer.handle 上挂载了中间件函数
  var stack = self.stack;

  // manage inter-router variables
  var parentParams = req.params;
  var parentUrl = req.baseUrl || '';
  var done = restore(out, req, 'baseUrl', 'next', 'params');

  // setup next layer
  req.next = next;

  // for options requests, respond with a default if nothing else responds
  if (req.method === 'OPTIONS') {
    done = wrap(done, function(old, err) {
      if (err || options.length === 0) return old(err);
      sendOptionsResponse(res, options, old);
    });
  }

  // setup basic req values
  req.baseUrl = parentUrl;
  req.originalUrl = req.originalUrl || req.url;

  // 执行 next 函数，也就是说，执行 router.handle 的时候，会自动调用 next
  next();

  function next() {/.../}

  function trim_prefix() {/.../}
}
```

router.handle 中主要的逻辑就是调用了一次 next 函数，也就是说，当外部访问的时候，会触发：

app --> app.handle --> router.handle --> next

下面再来看看 next 函数：

> express\lib\router\index.js

```js
// 定义 router.handle
proto.handle = function handle(req, res, out) {
  // 将 router 实例保存在 self 上
  var self = this;
  // ...

  var idx = 0; // 记录当前查找的中间件layer 在 stack 中索引
  // ...

  // 拿到 router 中存放 layer 实例的数组
  // layer.handle 上挂载了中间件函数
  var stack = self.stack;
  
  // ...

  // 执行 next 函数，也就是说，执行 router.handle 的时候，会自动调用 next
  next();

  function next() {
    // ...
    var layer;
    var match;
    var route;
      
    // 找到匹配的中间件 layer，当 match=true 代表找到匹配的
    // 如果找到，match=true，就跳出 while 循环（match !== true 才继续循环），所以需要调用 next 再次进入
    // 会判断请求路径、请求类型[post、get、...]
    while (match !== true && idx < stack.length) {
      // 取出 stack 数组中 idx 下标对应的 layer 实例
      // idx++：当前是 0，那么 会取到 stack[0]，执行完 stack[0]，idx 加 1
      layer = stack[idx++];

      // 判断请求路径是否一致
      match = matchLayer(layer, path);

      route = layer.route;

      if (typeof match !== 'boolean') {
        // hold on to layerError
        layerError = layerError || match;
      }

      if (match !== true) {
        continue;
      }

      if (!route) {
        // process non-route handlers normally
        continue;
      }

      if (layerError) {
        // routes do not match with a pending error
        match = false;
        continue;
      }

      // 获取请求类型，判断请求类型是否一致
      var method = req.method;
      var has_method = route._handles_method(method);

      // build up automatic options response
      if (!has_method && method === 'OPTIONS') {
        appendMethods(options, route._options());
      }

      // 请求类型不一致，match 置为 false
      if (!has_method && method !== 'HEAD') {
        match = false;
        continue;
      }
    }

    // 没找到匹配的中间件，结束
    if (match !== true) {
      return done(layerError);
    }

    // this should be done for the layer
    self.process_params(layer, paramcalled, req, res, function (err) {
      if (err) {
        return next(layerError || err);
      }

      if (route) {
        // 执行 layer.handle_request
        return layer.handle_request(req, res, next);
      }
      
      // 这里面的主要逻辑其实也是执行 layer.handle_request
      trim_prefix(layer, layerError, layerPath, path);
    });
  }

  function trim_prefix() {
    // ...

    if (layerError) {
      layer.handle_error(layerError, req, res, next);
    } else {
      layer.handle_request(req, res, next);
    }
  }
}
```

next 的主要逻辑：

- 通过 while 循环从 stack 数组中找到第一个匹配的 `中间件layer`

  - 中间件需要 `路径` 和 `请求类型` 都匹配上

    ```js
    app.use('/info', middleWare)
    
    app.get('/info', middleWare)
    ```

- 执行这个 `中间件layer` 的 handle_request



### 6.4、layer.handle_request

> express\lib\router\layer.js

```js
function Layer(path, options, fn) {
  // ...

  // 将 new Layer 传进来的中间件函数 fn 挂载到 Layer.handle
  this.handle = fn;
    
  // ...
}

Layer.prototype.handle_request = function handle(req, res, next) {
  var fn = this.handle;

  // ...

  try {
    fn(req, res, next);
  } catch (err) {
    next(err);
  }
};
```

可以发现，Layer.handle_request 的主要逻辑就是将之前挂载在 layer.handle 上的中间件函数拿来执行 `fn(req, res, next)`，并且将参数 req, res, next 传进去

那么当我们在使用中间件的时候：

- 如果调用了 next，那么会继续从 stack 数组中寻找下一个符合条件的`中间件layer`。（因为之前的 idx 已经改变，所以会从下一个索引位置开始查找）
- 如果没有调用 next，那么会停止，不会继续查找下一个中间件

这也是为什么，写了一堆中间件，条件都符合，如果没有执行 next，那么永远只会执行第一个中间件



### 6.5、总结

中间件的触发，主要就是外部访问，从存储所有`中间件layer` 的 stack 数组中找到匹配的 `中间件layer`，执行 `layer.handle_request`，实际上就是执行 layer.handle，而以前就是把中间件函数挂载在 layer.handle 上的，所以实际就是执行中间件函数，并且会把 next 当做参数传进去，当使用的时候调用了 next，继续去 stack 数组中查找下一个匹配的`中间件layer`



**基本流程就是：**

 <img src="/imgs/img1.png" style="zoom: 50%;" />



## 7、Express 内置中间件

> express\lib\express.js

```js
var bodyParser = require('body-parser')

exports = module.exports = createApplication;

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
```

Express 内置了一些中间件的功能，例如解析 body 参数为 application/json、x-www-form-urlencoded

可以直接使用：

```ks
const express = require('express')

const app = express()

app.use(express.json())
app.use(express.urlencoded())
```

其实，上面那两个，express 内部还是依赖于 body-parse 的



## 附录

参考文章：

[三步法解析Express源码](https://juejin.cn/post/6884575671721394189)

