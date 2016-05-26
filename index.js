// ================= ChatServer =================
/**
 * ChatServer - основной серверный класс приложения, включает через ассоциацию http сервер
 * и обработчики запросов.
 */

var http = require('http');

var ChatServer = function() {
    this.httpserver = null;
    this.handlers = [new ServiceHandler(), new StaticHandler()];

    this._handleRequest = this._handleRequest.bind(this);
};

ChatServer.prototype.start = function(port) {
    this.httpserver = http.createServer(this._handleRequest);
    this.httpserver.listen(port || 8088);
    console.log('Server listening on port ' + port);
};

ChatServer.prototype._handleRequest = function(request, response) {
    var hs = this.handlers;
    var handled = false;

    for(var i = 0; i < hs.length; i++) {
        if(handled) break;
        handled = hs[i].handleRequest(request, response);
    }

    if(!handled) {
        response.end();
    }
};

// ================= StaticHandler ==============
/**
 * Обработчик запросов к статическим файлам.
 * По умолчанию, файлы хранятся в папке public.
 * Реализует метод handleRequest, который выполняет обработку.
 *
 * @param staticPathPrefix
 * @constructor
 */
var StaticHandler = function(staticPathPrefix) {
    this.path = require('path');
    this.url  = require('url');
    this.fs   = require('fs');

    this.mimeTypesMap = {
        '.js'   : 'text/javascript',
        '.html' : 'text/html',
        '.css'  : 'text/css'
    };

    this.staticPathPrefix = staticPathPrefix || './public/';
};

StaticHandler.prototype.handleRequest = function(request, response) {
    var path = this._getFilePath(request);
    var mt   = this._getMimeType(path);

    console.log('Обрабатывается запрос к файлу ' + path);

    var fileStream = this.fs.createReadStream(path, {encoding: null});

    fileStream.on('error', function(error) {
        console.log('Could not open file ' + path);
        response.statusCode = 404;
        response.end();
    });

    fileStream.on('open', function() {
        response.writeHead(200, {'Content-Type': mt});
    });

    response.on('close', function() {
        fileStream.destroy();
    });

    fileStream.pipe(response);

    return true;
};

StaticHandler.prototype._getFilePath = function(request) {
    var path = this.url.parse(request.url).pathname;

    if(path == '/') {
        path = '/index.html';
    }

    path = path.substring(1, path.length);

    return this.staticPathPrefix + path;
};

StaticHandler.prototype._getMimeType = function(path) {
    return this.mimeTypesMap[this.path.extname(path)] || 'application/octet-stream';
}


// ================= ServiceHandler ====================

/**
 * Обработчик запросов к динамическим ресурсам.
 * Выполняет обработку пути /rs/*, где выполняются обработчики
 *  - выбора имени
 *  - получение истории сообщений
 *  - получение списка пользователей онлайн
 *  - отправка сообщений
 *  - longPolling для извещения о событиях на сервере
 *
 * @param request
 * @param response
 * @returns {boolean}
 */

var ServiceHandler = function() {
    this.chatroom = new ChatRoom();
    this.path = require('path');
    this.url  = require('url');
    this.handlers = null;
    this._setupHandlers();
};

ServiceHandler.prototype.handleRequest = function(request, response) {
    var pathSegments = this._getPathSegments(request);

    if(pathSegments.length != 2 || pathSegments[0] != 'rs') return false;

    var method = request.method;
    var cmd = method + ':' + pathSegments[1];
    var reqres = {request: request, response: response};

    if(!(cmd in this.handlers)) return false;

    console.log('Обрабатывается запрос к ресурсу ' + cmd);

    if(method == 'POST' && Number(request.headers['content-length'])) {
        var body = '';
        request.on('data', function(chunk) {
            body += chunk;
            if(body.length > 256000) {
                body = "";
                response.writeHead(413, {'Content-Type': 'text/plain'})
                response.end();
                request.connection.destroy();
            }
        });

        request.on('end', function() {
            var data;

            try {
                data = JSON.parse(body);
            } catch(e) {
                response.writeHead(400, {'Content-Type': 'text/plain'});
                response.end();
                request.connection.destroy();
                return;
            }

            console.log('Прочитанно данных ' + body.length);
            this._handleCommand(cmd, reqres, data);
        }.bind(this));
    } else {
        this._handleCommand(cmd, reqres);
    }

    return true;
};

ServiceHandler.prototype._setupHandlers = function() {
    this.handlers = {
        'POST:login': this._onLogin,
        'POST:newmessage': this._onNewMessage,
        'GET:history': this._onGetHistory,
        'GET:usersonline': this._onGetUsersOnline,
        'POST:polling': this._onSetConnection
    };
}

ServiceHandler.prototype._handleCommand = function(cmd, reqres, data) {
    var handler = this.handlers[cmd];
    if(typeof handler == 'function') {
        handler.call(this, reqres, data);
    } else {
        reqres.response.end();
    }
};

ServiceHandler.prototype._getPathSegments = function(request) {
    var path = this.url.parse(request.url).pathname;
    path = path.substring(1, path.length);

    return path.split('/');
};

ServiceHandler.prototype._onLogin = function(reqres, item) {
    var response = reqres.response;
    var username = item.username;

    if(username.length > 30) {
        console.log('Пользователь ' + item.username + ' уже существует ');
        response.writeHead(200, {'Content-Type': 'application/json'});
        response.end(JSON.stringify({success: false, description: 'LOGIN_USERNAME_TOO_LONG'}));
        return;
    }

    var id = this.chatroom.addUser(username);

    if(id < 0) {
        console.log('Пользователь ' + item.username + ' уже существует ');
        response.writeHead(200, {'Content-Type': 'application/json'});
        response.end(JSON.stringify({success: false, description: 'LOGIN_ALREADY_IN_USE'}));
    } else {
        console.log('Пользователь ' + item.username + ' добавлен в чат с id ' + id);
        response.writeHead(200, {'Content-Type': 'application/json'});
        response.end(JSON.stringify({success: true, userId: id}));
    }
};

ServiceHandler.prototype._onNewMessage = function(reqres, item) {
    var userId = item.userId;
    var response = reqres.response;

    console.log('Новое сообщение от пользователя ' + userId);

    if(this.chatroom.getUser(userId)) {
        this.chatroom.sendMessage(item.data, userId);
        response.writeHead(200, {'Content-Type': 'application/json'});
        response.end(JSON.stringify({success: true}));
    } else {
        response.writeHead(200, {'Content-Type': 'application/json'});
        response.end(JSON.stringify({success: false, description: 'NO_USER_LOGGED'}));
    }
};

ServiceHandler.prototype._onGetHistory = function(reqres) {
    var response = reqres.response;

    console.log('Запрос истории сообщений выполнен');

    response.writeHead(200, {'Content-Type': 'application/json'});
    response.end(JSON.stringify({success: true, data: this.chatroom.getHistory()}));
};

ServiceHandler.prototype._onGetUsersOnline = function(reqres) {
    var response = reqres.response;

    console.log('Запрос списка выполнен');

    response.writeHead(200, {'Content-Type': 'application/json'});
    response.end(JSON.stringify({success: true, data: this.chatroom.getUserNames()}));
};

ServiceHandler.prototype._onSetConnection = function(reqres, data) {
    var userId = data.userId;
    var response = reqres.response;
    var user = this.chatroom.getUser(userId);

    if(user) {
        console.log('Установка polling соединения от ' + userId + ' (' +user.username+ ')');
    } else {
        console.log('Установка polling соединения от ' + userId);
    }

    if(user && !user.active) {
        user.setConnection(reqres);
        console.log('Polling для ' + userId + ' (' +user.username+ ') установлен' )
    } else {
        console.log('Polling для ' + userId + ' не установлен' )
        response.writeHead(200, {'Content-Type': 'application/json'});
        response.end(JSON.stringify({success: false, description: 'NO_USER_LOGGED'}));
    }
};

// ==================== ChatRoom =====================
/**
 * Класс предметной области - представляет из себя комнату чата.
 * Содержит ссылки на пользователей онлайн, и на историю сообщений.
 *
 * @constructor
 */
var ChatRoom = function() {
    this.id = 0;
    this.users = {};
    this.history = [];
};

ChatRoom.prototype.addUser = function(userName) {
    for(var id in this.users) {
        var user = this.users[id];

        if(user.username == userName) return -1;
    }

    var id = 'id' + ++this.id;

    console.log('Пользователю ' + userName + ' присвоен id ' + id);
    this.users[id] = new User(this, userName, id);
    this.sendUserOnline({username: userName}, id);

    return id;
};

ChatRoom.prototype.getUser = function(userId) {
    return this.users[userId];
};

ChatRoom.prototype.removeUser = function(userId) {
    delete this.users[userId];
};

ChatRoom.prototype.sendMessage = function(message, userId) {
    this.history.push(message);

    for(var id in this.users) {
        if(id == userId) continue;
        var user = this.users[id];

        if(user.active && user.reqres) {
            console.log('Пользователю ' + user.username + ' отправляется сообщение');
            user.send({success: true, type: 'incomingmessage', data: message});
        } else {
            console.log('Пользователю ' + user.username + ' сообщение отправлено быть не может');
        }
    }
};

ChatRoom.prototype.sendUserOnline = function(message, userId) {
    for(var id in this.users) {
        if(id == userId) continue;
        var user = this.users[id];

        if(user.active && user.reqres) {
            console.log('Пользователю ' + user.username + ' отправляется сообщение о появлении нового пользователя');
            user.send({success: true, type: 'useronline', data: message});
        } else {
            console.log('Пользователю ' + user.username + ' сообщение о появлении пользователя отправлено быть не может');
        }
    }
};

ChatRoom.prototype.sendUserOffline = function(message, userId) {
    for(var id in this.users) {
        if(id == userId) continue;
        var user = this.users[id];

        if(user.active && user.reqres) {
            console.log('Пользователю ' + user.username + ' отправляется сообщение об уходе пользователя');
            user.send({success: true, type: 'useroffline', data: message});
        } else {
            console.log('Пользователю ' + user.username + ' сообщение об уходе отправлено быть не может');
        }
    }
};

ChatRoom.prototype.getHistory = function() {
    return this.history.slice(-1000);
};

ChatRoom.prototype.getUserNames = function() {
    var usernames = [];
    for(var id in this.users) {
        usernames.push({username: this.users[id].username});
    }

    return usernames;
};

// ================ User ===============
/**
 * Пользователь.
 * Характеризуется именеи, айди, открытым длинным запросом и активным/неактивным состоянием.
 * Неактивное состояние - отсутствие длинного запроса. По истечении некоторого времени такой пользователь
 * удаляется.
 *
 * @param chatRoom
 * @param userName
 * @param userId
 * @constructor
 */
var User = function(chatRoom, userName, userId) {
    this.chatRoom = chatRoom;
    this.active = false;
    this.reqres = null;
    this.username = userName;
    this.userId = userId;

    this.inactiveTimeout = null;

    this.destroy = this.destroy.bind(this);
    this.setActive(false);
};

User.prototype.send = function(data) {
    if(!this.reqres) return;

    var response = this.reqres.response;
    response.writeHead(200, {'Content-Type': 'application/json'});
    response.end(JSON.stringify(data));

    this.utilizeConnection();
}

User.prototype.setActive = function(value) {
    this.active = !!value;

    console.log('Пользователь ' + this.username + ' теперь ' + (this.active ? 'активен' : 'не активен'));

    if(!!value) {
        this._clearInactiveTimeout();
    } else {
        this._setInactiveTimeout();
    }
};

User.prototype.setConnection = function(reqres) {
    this.reqres = reqres;
    this.reqres.request.on('close', this.destroy);
    this.reqres.response.on('close', this.destroy);
    console.log('Пользователь ' + this.username + ' - polling соединение установлено');
    this.setActive(true);
};

User.prototype.utilizeConnection = function() {
    if(this.reqres) {
        this.reqres.request.removeListener('close', this.destroy);
        this.reqres.response.removeListener('close', this.destroy);
        this.reqres = null;
    }

    console.log('Пользователь ' + this.username + ' - polling соединение приостановлено');
    this.setActive(false);
};

User.prototype._setInactiveTimeout = function() {
    if(this.inactiveTimeout !== null) {
        this._clearInactiveTimeout();
    }
    this.inactiveTimeout = setTimeout(this.destroy, 15000);
};

User.prototype._clearInactiveTimeout = function() {
    if(this.inactiveTimeout === null) return;
    clearTimeout(this.inactiveTimeout);
    this.inactiveTimeout = null;
}

User.prototype.destroy = function() {
    console.log('Пользователь ' + this.username + ' уничтожается');
    this._clearInactiveTimeout();

    this.chatRoom.removeUser(this.userId)
    this.chatRoom.sendUserOffline({username: this.username}, this.userId);
    this.chatRoom = null;

    if(this.reqres) {
        this.reqres.request.removeListener('close', this.destroy);
        this.reqres.response.removeListener('close', this.destroy);
        this.reqres = null;
    }
}

var server = new ChatServer();
server.start(8088);