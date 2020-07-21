"use strict";
/********************************************************************************
 * Copyright (C) 2020. Huawei Technologies Co., Ltd. All rights reserved.
 * SPDX-License-Identifier: MIT
 ********************************************************************************/
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.call = exports.expose = exports.exposable = exports.messaging = exports.Messaging = exports.Deferred = void 0;
const uuid_1 = require("uuid");
require("reflect-metadata");
class Deferred {
    constructor() {
        this.isPending = true;
        this.isFulfilled = false;
        this.isRejected = false;
        this.promise = new Promise((resolve, reject) => {
            this.resolve = (value) => {
                resolve(value);
                this.isFulfilled = true;
                this.isPending = false;
            };
            this.reject = (error) => {
                reject(error);
                this.isRejected = true;
                this.isPending = false;
            };
        });
    }
}
exports.Deferred = Deferred;
/**
 * messaging protocal
 * page work with messaging protocal must implements the IframeLike Interface
 */
class Messaging {
    constructor(iframeContext, clientId) {
        this.exposedFunctions = new Map();
        // calls have been sent to remote
        this.pendingCalls = new Map();
        // calls received and is executing, stored with id
        this.executingCalls = new Map();
        this.iframeContext = iframeContext;
        this.iframeContext.registerMessageHandler(this.onRemoteCall.bind(this));
        this.iframeContext.onDispose(this.dispose.bind(this));
        this.from = clientId ? clientId : uuid_1.v4();
    }
    static bind(iframeContext, clientId) {
        if (!Messaging.instance) {
            Messaging.instance = new Messaging(iframeContext, clientId);
        }
        else {
            console.log(`Messaging is already bind to client ${Messaging.instance.from}`);
        }
        return Messaging.instance;
    }
    static getInstance() {
        if (!Messaging.instance) {
            console.log('Messaging has not been initialized, using "bind" function to bind and initialize Messaging instance');
        }
        return Messaging.instance;
    }
    dispose() {
        Messaging.instance = undefined;
    }
    sendRemoteCall(remoteCall) {
        remoteCall.from = this.from;
        if (remoteCall.notify) {
            this.iframeContext.postMessage(remoteCall);
            return undefined;
        }
        const deferred = new Deferred();
        this.pendingCalls.set(remoteCall.id, deferred);
        this.iframeContext.postMessage(remoteCall);
        return deferred;
    }
    onRemoteCall(remoteCall) {
        // discard message sent from this instance
        if (!remoteCall || remoteCall.from === this.from) {
            // console.log(`ack received: remoteCall.from`);
            return;
        }
        // discard message does not send to this client
        if (remoteCall.to !== '*' && remoteCall.to !== this.from) {
            return;
        }
        if (remoteCall.notify) {
            // received a notify from remote to complete a call
            const call = this.pendingCalls.get(remoteCall.id);
            if (call) {
                delete remoteCall.notify;
                if (remoteCall.success) {
                    call.resolve(remoteCall.ret);
                }
                else {
                    call.reject(remoteCall.ret);
                }
                this.pendingCalls.delete(remoteCall.id);
            }
            return;
        }
        if (!remoteCall.func) {
            return;
        }
        const funcName = remoteCall.func.indexOf('::') >= 0
            ? remoteCall.func.substr(remoteCall.func.indexOf('::') + 2)
            : remoteCall.func;
        const func = this.exposedFunctions.get(funcName);
        if (func) {
            this.executingCalls.set(remoteCall.id, remoteCall.func);
            const args = remoteCall.args ? remoteCall.args : [];
            func(...args)
                .then((ret) => {
                this.executingCalls.delete(remoteCall.id);
                // send notify to remote when function call completed
                this.sendRemoteCall({
                    id: remoteCall.id,
                    func: remoteCall.func,
                    ret: ret,
                    success: true,
                    notify: true,
                    to: remoteCall.from,
                    from: remoteCall.to
                });
            })
                .catch((err) => {
                const errData = {};
                Object.getOwnPropertyNames(err).forEach((value, index) => {
                    errData[value] = err[value];
                });
                this.sendRemoteCall({
                    id: remoteCall.id,
                    func: remoteCall.func,
                    ret: errData,
                    success: false,
                    notify: true,
                    to: remoteCall.from,
                    from: remoteCall.to
                });
            });
        }
        else {
            this.sendRemoteCall({
                id: remoteCall.id,
                func: remoteCall.func,
                ret: `no function exposed as ${remoteCall.func}`,
                success: false,
                notify: true,
                to: remoteCall.from,
                from: this.from
            });
        }
    }
    /**
     * expose function to remote
     * exposed function can be called remotely using call(func: string, args: any[]): Promise<any>
     * @param func function to expose
     * @param identifier unique identifier for calling remotely
     */
    expose(func, identifier) {
        this.exposedFunctions.set(identifier ? identifier : func.name, (...args) => __awaiter(this, void 0, void 0, function* () {
            return func(...args);
        }));
    }
    /**
     * make a remote function call
     * @param func remote function name
     * @param args arguments passed to remote function
     */
    call(func, ...args) {
        return __awaiter(this, void 0, void 0, function* () {
            const callDeferred = this.sendRemoteCall({
                id: uuid_1.v4(),
                func: func,
                args: args,
                notify: false,
                from: this.from,
                to: func.indexOf('::') >= 0 ? func.substr(0, func.indexOf('::')) : '*'
            });
            return callDeferred.promise;
        });
    }
    getExposedFunctions() {
        return this.exposedFunctions;
    }
}
exports.Messaging = Messaging;
const exposeMetadataKey = Symbol('expose');
/**
 * bind messaging protocal to which implements IframeLike
 * notice: this decorator only support class without static member
 * @param constructorFunction constrctor function of page implements IframeLike
 * @example
 * ```
 *     @messaging('my-client')
 *     export class IframePage implements IframeLike{
 *
 *     }
 * ```
 */
function messaging(clientId) {
    return function (constructorFunction) {
        //new constructor function
        const newConstructorFunction = function (...args) {
            const func = function () {
                return new constructorFunction(...args);
            };
            func.prototype = constructorFunction.prototype;
            const result = new func(...args);
            Messaging.bind(result, clientId);
            return result;
        };
        newConstructorFunction.prototype = constructorFunction.prototype;
        return newConstructorFunction;
    };
}
exports.messaging = messaging;
/**
 * exposable class which can be bind with messaging protocal
 * notice: this decorator only support class without static member
 * @param constrctor function of page implements IframeLike
 * @example
 * ```
 *     @exposable
 *     export class ExposedLocalAPi {
 *         @expose('identifier_of_your_function')
 *         public doSomething(something: any): any {
 *             const ret = `do ${something}`;
 *             return ret;
 *         }
 *     }
 * ```
 */
function exposable(constructorFunction) {
    //new constructor function
    const newConstructorFunction = function (...args) {
        const func = function () {
            return new constructorFunction(...args);
        };
        func.prototype = constructorFunction.prototype;
        const result = new func(...args);
        const exposedMethods = Reflect.getMetadata(exposeMetadataKey, result);
        const messagingInstance = Messaging.getInstance();
        if (!messagingInstance || !exposedMethods) {
            return result;
        }
        exposedMethods.forEach((method, identifier) => {
            if (messagingInstance.getExposedFunctions().get(identifier)) {
                console.log(`warning: identifier "${identifier}" rebind to [${JSON.stringify(result)}].[${method}] `);
            }
            messagingInstance.expose((...args) => {
                return Promise.resolve(method.apply(result, args));
            }, identifier);
            // console.log(`Messaging API exposed: ${identifier}, ${method}`);
        });
        return result;
    };
    newConstructorFunction.prototype = constructorFunction.prototype;
    return newConstructorFunction;
}
exports.exposable = exposable;
/**
 * decorator to expose function for remote call
 * @param identifier unique identifier of function to be exposed
 * @example
 * ```
 *     @exposable
 *     export class ExposabledLocalAPi {
 *         @expose('identifier_of_your_function')
 *         public doSomething(something: any): any {
 *             const ret = `do ${something}`;
 *             return ret;
 *         }
 *     }
 * ```
 */
function expose(identifier) {
    return function (target, propertyKey, descriptor) {
        const method = descriptor.value;
        let stored = Reflect.getMetadata(exposeMetadataKey, target);
        if (stored) {
            const oldBind = stored.get(identifier);
            if (oldBind) {
                console.log(`warning: duplicated identifier detected! function identifier '${identifier}' is rebinded from ${oldBind} to ${method}`);
            }
            stored.set(identifier, method);
        }
        else {
            stored = new Map();
            stored.set(identifier, method);
        }
        Reflect.defineMetadata(exposeMetadataKey, stored, target);
    };
}
exports.expose = expose;
/**
 * delegate to call remote function, all parameter will be passed to remote
 * @param exposedFunctionIdentifier identifier of exposed function
 * @example
 * ```
 *     @call('identifier_of_your_function')
 *     function callRemote(type: string, event: any) {
 *         // console.log(`remtoe function called`);
 *     }
 * ```
 */
function call(exposedFunctionIdentifier) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = function (...args) {
            const messagingInstance = Messaging.getInstance();
            if (messagingInstance) {
                messagingInstance.call(exposedFunctionIdentifier, ...args);
            }
            originalMethod(...args);
        };
    };
}
exports.call = call;
