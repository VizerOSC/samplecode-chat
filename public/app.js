var Helper = {
    dateFormatter: function(date) {
        if(typeof date == 'number') {
            date = new Date(date);
        }

        if(isNaN( date.getTime() )) {
            return '';
        }

        pad = Helper.padWZeros.bind(null, 2);

        var YY = date.getFullYear();
        var MM = pad(date.getMonth() + 1);
        var DD = pad(date.getDate());
        var hh = pad(date.getHours());
        var mm = pad(date.getMinutes());
        var ss = pad(date.getSeconds());

        return DD + '.' + MM + '.' + YY + ' ' + hh + ':' + mm + ':' + ss;
    },
    padWZeros: function(len, str) {
        if(!str) {
            str = '';
        }
        if(typeof str == 'number') {
            str = str + '';
        }
        if(!len) {
            len = 0;
        }

        var dx = len - str.length;
        if(dx > 0) {
            str = new Array(dx + 1).join('0') + str;
        }

        return str;
    },
    htmlEscape: function(str) {
        str = (str || '').toString();

        return str
            .replace(/&/g, '&amp')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot')
            .replace(/'/g, '&#39;');
    },
    nl2br: function(str) {
        str = (str || '').toString();

        return str.replace(/\n/g, '<BR>');
    }
};

// ================ Event =================

var Event = function() {
    this.listeners = {};
};

Event.prototype.fire = function(eventName, args) {
    if(this.listeners[eventName]) {
        var list = this.listeners[eventName];

        for(var i = 0, l = list.length; i < l; i++) {
            if(typeof list[i] != 'function') continue;
            list[i].apply(window, args);
        }
    }
};

Event.prototype.on = function(eventName, listener, scope) {
    if(!this.listeners[eventName]) {
        this.listeners[eventName] = [];
    }

    this.listeners[eventName].push(listener);
};

Event.prototype.off = function(eventName, listener) {
    if(this.listeners[eventName]) {
        if(listener) {
            var index = this.listeners[eventName].indexOf(listener);
            if(index >= 0) {
                this.listeners[eventName].splice(index, 1);
            }
        } else {
            this.listeners[eventName].length = 0;
        }
    }
};

// ================ Application =================

var Application = function() {
    this.connection = new Connection(this);
    this.currentView = 'login';
    this.currentUser = null;
    this.userId = null;

    this.viewLogin = new ChatLoginView(this);
    this.viewLogin.renderTo(document.body);

    this.connection.on('error', function(data) {
        if(data.description == 'CONNECTION_LOST') {
            this.restart();
        } else if(data.description == 'CONNECTION_ERROR') {
            this.restart();
        } else if(data.description == 'NO_USER_LOGGED') {
            this.restart();
        }
    }.bind(this));
};

Application.prototype.bodyTemplate =
    '<div class="chat"><div class="chat-wrapper"></div></div>';

Application.prototype.restart = function() {
    window.location.reload();
};

Application.prototype.transitionToMain = function() {
        if(this.currentView == 'main') return;

        this.connection.connect();

        this.viewLogin.destroy();
        this.viewLogin = null;

        var messages = new ChatMessagesModel(this.connection);
        var users    = new ChatUsersModel(this.connection);

        document.body.insertAdjacentHTML('beforeEnd', this.bodyTemplate);

        this._ref();

        this.viewMessages = new ChatMessagesView(messages);
        this.viewUsers    = new ChatUsersView(users);
        this.viewTextArea = new ChatTextAreaView(messages, this);

        this.viewMessages.renderTo(this.chatWrapper);
        this.viewUsers.renderTo(this.chatWrapper);
        this.viewTextArea.renderTo(this.chat);

        users.load();
        messages.load();
        this.currentView = 'main';
};

Application.prototype._ref = function() {
    this.chat = document.body.getElementsByClassName('chat')[0];
    this.chatWrapper = this.chat.getElementsByClassName('chat-wrapper')[0];
};

// ================ ChatLoginView ==================
/**
 * Представление панели выбора имени.
 * Класс занимается рендерингом и обработкой событий UI.
 *
 * @param application
 * @constructor
 */

var ChatLoginView = function(application) {
    this._onSubmitClicked = this._onSubmitClicked.bind(this);
    this.application = application;
};

ChatLoginView.prototype.bodyTemplate =
    '<div class="login">' +
        '<div class="login-row login-label">' +
            'Введите имя:' +
        '</div>' +
        '<div class="login-row login-field">' +
            '<input type="text" class="login-field-element"/>' +
        '</div>' +
        '<div class="login-row login-error">' +
        '</div>' +
        '<div class="login-row login-button">' +
            '<button class="login-button-element">Войти</button>' +
        '</div>' +
    '</div>';

ChatLoginView.prototype.renderTo = function(elementNode) {
    if(!elementNode) return;
    this.renderTarget = elementNode;

    var bodyMarkup = this.bodyTemplate;

    elementNode.insertAdjacentHTML('beforeEnd', bodyMarkup);

    this._ref(elementNode);
    this._setEventListeners();
};

ChatLoginView.prototype._ref = function(elementNode) {
    this.element = elementNode.getElementsByClassName('login')[0];
    this.field = this.element.getElementsByClassName('login-field-element')[0];
    this.button = this.element.getElementsByClassName('login-button-element')[0];
    this.errorLabel = this.element.getElementsByClassName('login-error')[0];
};

ChatLoginView.prototype._setEventListeners = function() {
    this.button.addEventListener('click', this._onSubmitClicked);
};

ChatLoginView.prototype._onSubmitClicked = function() {
    var con = this.application.connection;
    var userName = this.field.value;
    this.errorLabel.innerText = '';

    con.postLogin(userName, function(response) {
        if(response.success) {
            this.application.userId = response.userId;
            this.application.currentUser = userName;
            this.application.transitionToMain();
        } else {
            if(response.description == 'LOGIN_ALREADY_IN_USE') {
                this.errorLabel.innerText = 'Введенное имя занято, попробуйте выбрать другое.';
            } else if (response.description == 'LOGIN_USERNAME_TOO_LONG') {
                this.errorLabel.innerText = 'Введенное имя слишком длинное.';
            } else {
                this.errorLabel.innerText = 'Невозможно соединиться с сервером.';
            }
        }
    }.bind(this));
};

ChatLoginView.prototype.destroy = function() {
    if(this.element && this.element.parentNode) {
        this.element.parentNode.removeChild(this.element);
    }

    this.button.removeEventListener('click', this._onSubmitClicked);

    this.element = null;
    this.field = null;
    this.button = null;
    this.errorLabel = null;
};

// ================ ChatMessagesView =================
/**
 * Представление панели с сообщениями.
 * Класс занимается рендерингом и обработкой событий модели данных.
 *
 * @param application
 * @constructor
 */

var ChatMessagesView = function(chatMessagesModel) {
    this.add = this.add.bind(this);
    this.set = this.set.bind(this);

    this._bindModel(chatMessagesModel);
};

ChatMessagesView.prototype.bodyTemplate =
    '<div class="chat-messages">{body}</div>';

ChatMessagesView.prototype.msgTemplate  =
    '<div class="chat-message">' +
        '<div class="chat-message-meta-info">' +
            '<span class="chat-message-username">{username}</span><span class="chat-message-datetime">{messageDateTime}</span>' +
        '</div>' +
        '<div class="chat-message-body">' +
            '{messageText}' +
        '</div>' +
    '</div>';

ChatMessagesView.prototype.sysmsgTemplate =
    '<div class="chat-message chat-message-system">' +
        '<div class="chat-message-body">' +
            '{messageText}' +
        '</div>' +
    '</div>';

ChatMessagesView.prototype.add = function(message, index) {
    var referenceElement = this.messages[index + 1];
    var markup = this._renderMessage(message);
    var container = document.createElement('DIV');;

    container.innerHTML = markup;

    if(!referenceElement) {
        this.element.appendChild(container.firstChild);
    } else {
        this.element.insertBefore(container.firstChild, referenceElement);
    }
};

ChatMessagesView.prototype.set = function(messages) {
    var markup = this._renderBody();
    this.element.innerHTML = markup;
};

ChatMessagesView.prototype.renderTo = function(elementNode) {
    if(!elementNode) return;

    this.renderTarget = elementNode;
    var bodyMarkup = this.bodyTemplate.replace('{body}', this._renderBody());
    elementNode.insertAdjacentHTML('beforeEnd', bodyMarkup);

    this._ref(elementNode);
};

ChatMessagesView.prototype._renderMessage = function(msg) {
    var e = Helper.htmlEscape;
    var n = Helper.nl2br;

    if(msg.type == 'usermsg') {
        return this.msgTemplate
                        .replace('{username}', e(msg.author))
                        .replace('{messageDateTime}', Helper.dateFormatter(msg.datetime))
                        .replace('{messageText}', n(e(msg.text)));
    } else if(msg.type == 'sysmsg') {
        return this.sysmsgTemplate
                        .replace('{messageText}', n(e(msg.text)));
    } else {
        return '';
    }
};

ChatMessagesView.prototype._renderBody = function(messagesList) {
    var messagesList = messagesList || this.model.getItems();
    var bodyMarkup = '';
    var msg;

    for(var i = 0, l = messagesList.length; i < l; i++) {
        msg = messagesList[i];
        bodyMarkup += this._renderMessage(msg);
    }

    return bodyMarkup;
};

ChatMessagesView.prototype._ref = function(elementNode) {
    this.element = elementNode.getElementsByClassName('chat-messages')[0];
    this.messages = this.element.children;
};

ChatMessagesView.prototype._bindModel = function(model) {
    this.model = model;

    model.on('added', this.add);
    model.on('loaded', this.set)
};

ChatMessagesView.prototype.destroy = function() {
    if(this.element && this.element.parentNode) {
        this.element.parentNode.removeChild(this.element);
    }

    this.element = null;
    this.messages = null;
    this.renderTarget = null;

    this.model.off('added', this.add);
    this.model.off('loaded', this.set);
    this.model = null;
};

// ================ ChatUsersView =================

/**
 * Представление панели со списком пользователей онлайн.
 * Класс занимается рендерингом и обработкой событий модели данных.
 *
 * @param application
 * @constructor
 */

var ChatUsersView = function(chatUsersModel) {
    this.add = this.add.bind(this);
    this.remove = this.remove.bind(this);
    this.set = this.set.bind(this);

    this._bindModel(chatUsersModel);
};

ChatUsersView.prototype.bodyTemplate =
    '<div class="chat-usernames-online">{body}</div>';

ChatUsersView.prototype.userTemplate =
    '<div class="chat-usernames-online-username">{username}</div>';

ChatUsersView.prototype.add = function(user, index) {
    var referenceElement = this.users[index + 1];
    var markup = this._renderUser(user);
    var container = document.createElement('DIV');

    container.innerHTML = markup;

    if(!referenceElement) {
        this.element.appendChild(container.firstChild);
    } else {
        this.element.insertBefore(container.firstChild, referenceElement);
    }
};

ChatUsersView.prototype.remove = function(index) {
    var child = this.users[index];

    if(child) {
        this.element.removeChild(child);
    }
};

ChatUsersView.prototype.set = function(users) {
    var markup = this._renderBody();
    this.element.innerHTML = markup;
};

ChatUsersView.prototype.renderTo = function(elementNode) {
    if(!elementNode) return;

    this.renderTarget = elementNode;
    var bodyMarkup = this.bodyTemplate.replace('{body}', this._renderBody());
    elementNode.insertAdjacentHTML('beforeEnd', bodyMarkup);

    this._ref(elementNode);
};

ChatUsersView.prototype._renderUser = function(user) {
    var e = Helper.htmlEscape;

    return this.userTemplate
        .replace('{username}', e(user.username));
};

ChatUsersView.prototype._renderBody = function(usersList) {
    var usersList = usersList || this.model.getItems();
    var bodyMarkup = '';
    var user;

    for(var i = 0, l = usersList.length; i < l; i++) {
        user = usersList[i];
        bodyMarkup += this._renderUser(user);
    }

    return bodyMarkup;
};

ChatUsersView.prototype._ref = function(elementNode) {
    this.element = elementNode.getElementsByClassName('chat-usernames-online')[0];
    this.users = this.element.children;
};

ChatUsersView.prototype._bindModel = function(model) {
    this.model = model;

    model.on('added', this.add);
    model.on('removed', this.remove);
    model.on('loaded', this.set);
};

ChatUsersView.prototype.destroy = function() {
    if(this.element && this.element.parentNode) {
        this.element.parentNode.removeChild(this.element);
    }

    this.element = null;
    this.users = null;
    this.renderTarget = null;

    this.model.on('added', this.add);
    this.model.on('removed', this.remove);
    this.model.on('loaded', this.set);
    this.model = null;
};


// ================ ChatTextAreaView =================

/**
 * Представление панели с полем для ввода.
 * Класс занимается рендерингом и обработкой событий UI.
 *
 * @param application
 * @constructor
 */

var ChatTextAreaView = function(chatMessagesModel, application) {
    this._onSubmitClicked = this._onSubmitClicked.bind(this);
    this.application = application;

    this._bindModel(chatMessagesModel);
};

ChatTextAreaView.prototype.bodyTemplate =
    '<div class="chat-input">' +
        '<div class="chat-input-area-wrapper">' +
            '<textarea class="chat-input-area"></textarea>' +
            '<button class="chat-input-submit">Отправить</button>' +
        '</div>' +
    '</div>';

ChatTextAreaView.prototype.renderTo = function(elementNode) {
    if(!elementNode) return;

    this.renderTarget = elementNode;

    var bodyMarkup = this.bodyTemplate;

    elementNode.insertAdjacentHTML('beforeEnd', bodyMarkup);

    this._ref(elementNode);
    this._setEventListeners();
};

ChatTextAreaView.prototype._ref = function(elementNode) {
    this.element = elementNode.getElementsByClassName('chat-input')[0];
    this.textarea = this.element.getElementsByClassName('chat-input-area')[0];
    this.button = this.element.getElementsByClassName('chat-input-submit')[0];
};

ChatTextAreaView.prototype._setEventListeners = function() {
  this.button.addEventListener('click', this._onSubmitClicked);
};

ChatTextAreaView.prototype._onSubmitClicked = function(event) {
    var text = this.textarea.value;
    this.textarea.value = '';
    this.model.add({
        type: 'usermsg',
        author: this.application.currentUser,
        datetime: Date.now(),
        text: text
    }, true);
};

ChatTextAreaView.prototype._bindModel = function(model) {
    this.model = model;
}

ChatTextAreaView.prototype.destroy = function() {
    if(this.element && this.element.parentNode) {
        this.element.parentNode.removeChild(this.element);
    }

    this.element = null;
    this.textarea = null;
    this.renderTarget = null;

    this.model = null;
}

// ================ ChatMessagesModel =================

/**
 * Данные сообщений
 *
 * @param application
 * @constructor
 */

var ChatMessagesModel = function(connection) {
    Event.call(this);
    this.connection = connection;
    this.items = [];

    this._setupConnectionListeners();
};

ChatMessagesModel.prototype = Object.create(Event.prototype);
ChatMessagesModel.prototype.constructor = ChatMessagesModel;

ChatMessagesModel.prototype.add = function(item, send) {
    var index = this._findIndex(item);
    this.items.splice(index, 0, item);

    this.fire('added', [item, index]);

    if(send) {
        this.connection.postMessage(item, function() {

        });
    }
};

ChatMessagesModel.prototype.load = function(items) {
    if(items) {
        this.items = items;
    } else {
        this.connection.getHistory(function(items) {
            this.load(items);
        }.bind(this));
        return;
    }

    this.fire('loaded');
};

ChatMessagesModel.prototype.getItems = function() {
    return this.items;
};

ChatMessagesModel.prototype._findIndex = function(item) {
    for(var i = this.items.length - 1; i >= 0; i--) {
        if(item.datetime >= this.items[i].datetime) {
            return i + 1;
        }
    };

    return 0;
};

ChatMessagesModel.prototype._setupConnectionListeners = function() {
    var con = this.connection;
    con.on('incomingMessage', function(msg) {
        this.add(msg);
    }.bind(this));
};

// ================ ChatUsersModel =================

/**
 * Список пользователей онлайн.
 *
 * @param application
 * @constructor
 */

var ChatUsersModel = function(connection) {
    Event.call(this);
    this.connection = connection;
    this.items = [];

    this._setupConnectionListeners();
};

ChatUsersModel.prototype = Object.create(Event.prototype);
ChatUsersModel.prototype.constructor = ChatUsersModel;

ChatUsersModel.prototype.add = function(item) {
    this.items.push(item);
    var index = this.items.length - 1;

    this.fire('added', [item, index]);
};

ChatUsersModel.prototype.remove = function(item) {
    for(var i = 0; i < this.items.length; i++) {
        if(item.username == this.items[i].username) break;
    }

    this.items.splice(i, 1);

    this.fire('removed', [i]);
};

ChatUsersModel.prototype.load = function(items) {
    if(items) {
        this.items = items;
    } else {
        this.connection.getOnlineUsers(function(items) {
            this.load(items);
        }.bind(this));
        return;
    }

    this.fire('loaded');
};

ChatUsersModel.prototype.getItems = function() {
    return this.items;
};

ChatUsersModel.prototype._setupConnectionListeners = function() {
    var con = this.connection;
    con.on('userOffline', function(user) {
        this.remove(user);
    }.bind(this));
    con.on('userOnline', function(user) {
        this.add(user);
    }.bind(this));
}

// ================ Connection =================

/**
 * Класс, инкапсулирующий общение с сервером.
 * Представляет простой API для выполнения операций.
 *
 * @param application
 * @constructor
 */

/*
    Connection может вызвать следующие серверные события:
    userOffline
    userOnline
    incomingMessage
 */

var Connection = function(app) {
    this.application = app;
    Event.call(this);
    this.path = 'rs/';
};

Connection.prototype = Object.create(Event.prototype);
Connection.prototype.constructor = Connection;

Connection.prototype.postLogin = function(login, callback) {
    this._request('POST', 'login', {username: login}, callback);
};

Connection.prototype.getHistory = function(callback) {
    this._request('GET', 'history', undefined, function(response) {
        if(response.success) {
            callback(response.data);
        } else {
            this.fire('error', [response.description]);
        }
    }.bind(this));
};

Connection.prototype.postMessage = function(data, callback) {
    data = {
        userId: this.application.userId,
        data: data
    };

    this._request('POST', 'newmessage', data, callback);
};

Connection.prototype.getOnlineUsers = function(callback) {
    this._request('GET', 'usersonline', undefined, function(response) {
        if(response.success) {
            callback(response.data);
        } else {
            this.fire('error', [response.description]);
        }
    }.bind(this));
};

Connection.prototype.connect = function() {
    this._setLongPoll();
};

Connection.prototype._request = function(method, path, data, callback) {
    var request = new XMLHttpRequest();
    request.open(method, this.path + path, true);
    request.onreadystatechange = function() {
        if(request.readyState == 4 && request.status == 0) {
            callback({success: false, description: 'CONNECTION_LOST'});
        }

        if(request.readyState == 4 && request.status != 200) {
            callback({success: false, description: 'CONNECTION_ERROR', request: request});
        }

        if(request.readyState == 4 && request.status == 200) {
            var responseJSON;
            if(request.responseText) {
                responseJSON = JSON.parse(request.responseText);
            }
            callback(responseJSON);
        }
    }

    if(data) {
        data = JSON.stringify(data);
    }
    request.send(data);
};

Connection.prototype._setLongPoll = function() {
    console.log('CONNECTING LONG POLLING');
    this._request('POST', 'polling', {userId: this.application.userId}, function(response) {
        if(response.success) {
            var type = response.type;

            try {
                switch(type) {
                    case 'useroffline': {
                        var userName = response.data.username;
                        this.fire('userOffline', [response.data]);
                        this.fire('incomingMessage', [{
                            type: 'sysmsg',
                            datetime: Date.now(),
                            text: 'Из чата вышел пользователь ' + userName
                        }]);
                        break;
                    }
                    case 'useronline': {
                        var userName = response.data.username;
                        this.fire('userOnline', [response.data]);
                        this.fire('incomingMessage', [{
                            type: 'sysmsg',
                            datetime: Date.now(),
                            text: 'В чат зашел пользователь ' + userName
                        }]);
                        break;
                    }
                    case 'incomingmessage': {
                        this.fire('incomingMessage', [response.data]);
                        break;
                    }
                }
            } catch(e) {
                console.error(e);
            }

            this._setLongPoll();
        } else {
            this.fire('error', [response])
        }


    }.bind(this));
};

window.onload = function() {
    window.app = new Application();
}