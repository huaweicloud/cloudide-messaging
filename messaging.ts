/********************************************************************************
 * Copyright (C) 2020. Huawei Technologies Co., Ltd. All rights reserved.
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

/* eslint-disable @typescript-eslint/no-explicit-any */
import { v4 as uuid } from 'uuid';
import 'reflect-metadata';

export class Deferred<T> {
    resolve!: (value?: T) => void;
    reject!: (err?: any) => void;
    isPending = true;
    isFulfilled = false;
    isRejected = false;

    promise = new Promise<T>((resolve, reject) => {
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

export interface IframeLike {
    registerMessageHandler: (messageHandler: (message: any) => void) => void;
    postMessage: (message: any) => void;
    onDispose: (disposedEventHandler: (...args: any[]) => void) => void;
}

export interface RemoteCall {
    id: string;
    from: string;
    to: string;
    notify: boolean;
    func: string;
    args?: any[];
    ret?: any;
    success?: boolean;
}

/**
 * messaging protocal
 * page work with messaging protocal must implements the IframeLike Interface
 */
export class Messaging {
    private static instance: Messaging | undefined;

    private exposedFunctions: Map<string, (...args: any[]) => Promise<any>> = new Map();

    // calls have been sent to remote
    private pendingCalls: Map<string, Deferred<any>> = new Map();

    // calls received and is executing, stored with id
    private executingCalls: Map<string, string> = new Map();

    private iframeContext: IframeLike;

    private readonly from: string;

    private constructor(iframeContext: IframeLike, clientId?: string) {
        this.iframeContext = iframeContext;
        this.iframeContext.registerMessageHandler(this.onRemoteCall.bind(this));
        this.iframeContext.onDispose(this.dispose.bind(this));
        this.from = clientId ? clientId : uuid();
    }

    static bind(iframeContext: IframeLike, clientId?: string): Messaging {
        if (!Messaging.instance) {
            Messaging.instance = new Messaging(iframeContext, clientId);
        } else {
            console.log(`Messaging is already bind to client ${Messaging.instance.from}`);
        }

        return Messaging.instance;
    }

    static getInstance(): Messaging | undefined {
        if (!Messaging.instance) {
            console.log(
                'Messaging has not been initialized, using "bind" function to bind and initialize Messaging instance'
            );
        }
        return Messaging.instance;
    }

    private dispose(): void {
        Messaging.instance = undefined;
    }

    private sendRemoteCall(remoteCall: RemoteCall): Deferred<any> | undefined {
        remoteCall.from = this.from;
        if (remoteCall.notify) {
            this.iframeContext.postMessage(remoteCall);
            return undefined;
        }
        const deferred = new Deferred<any>();
        this.pendingCalls.set(remoteCall.id, deferred);
        this.iframeContext.postMessage(remoteCall);
        return deferred;
    }

    private onRemoteCall(remoteCall: RemoteCall): void {
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
                } else {
                    call.reject(remoteCall.ret);
                }

                this.pendingCalls.delete(remoteCall.id);
            }
            return;
        }

        if (!remoteCall.func) {
            return;
        }
        const funcName =
            remoteCall.func.indexOf('::') >= 0
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
                        (errData as any)[value] = err[value];
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
        } else {
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
    expose(func: <T>(...args: any[]) => Promise<T>, identifier?: string): void {
        this.exposedFunctions.set(identifier ? identifier : func.name, async (...args: any[]) => {
            return func(...args);
        });
    }

    /**
     * make a remote function call
     * @param func remote function name
     * @param args arguments passed to remote function
     */
    async call(func: string, ...args: any[]): Promise<any> {
        const callDeferred = this.sendRemoteCall({
            id: uuid(),
            func: func,
            args: args,
            notify: false,
            from: this.from,
            to: func.indexOf('::') >= 0 ? func.substr(0, func.indexOf('::')) : '*'
        });
        return callDeferred!.promise;
    }

    getExposedFunctions(): Map<string, (...args: any[]) => Promise<any>> {
        return this.exposedFunctions;
    }
}

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
export function messaging(clientId?: string) {
    return function <T extends new (...constructorArgs: any[]) => any>(constructorFunction: T): any {
        //new constructor function
        const newConstructorFunction: any = function (...args: any[]) {
            const func: any = function () {
                return new constructorFunction(...args);
            };
            func.prototype = constructorFunction.prototype;
            const result: any = new func(...args);
            Messaging.bind(result, clientId);
            return result;
        };
        newConstructorFunction.prototype = constructorFunction.prototype;
        return newConstructorFunction;
    };
}

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
export function exposable<T extends new (...constructorArgs: any[]) => any>(constructorFunction: T): any {
    //new constructor function
    const newConstructorFunction: any = function (...args: any[]) {
        const func: any = function () {
            return new constructorFunction(...args);
        };
        func.prototype = constructorFunction.prototype;
        const result: any = new func(...args);
        const exposedMethods: Map<any, any> = Reflect.getMetadata(exposeMetadataKey, result);
        const messagingInstance = Messaging.getInstance();
        if (!messagingInstance || !exposedMethods) {
            return result;
        }
        exposedMethods.forEach((method, identifier) => {
            if (messagingInstance.getExposedFunctions().get(identifier)) {
                console.log(`warning: identifier "${identifier}" rebind to [${JSON.stringify(result)}].[${method}] `);
            }
            messagingInstance.expose((...args: any[]): Promise<any> => {
                return Promise.resolve(method.apply(result, args));
            }, identifier);
            // console.log(`Messaging API exposed: ${identifier}, ${method}`);
        });

        return result;
    };
    newConstructorFunction.prototype = constructorFunction.prototype;
    return newConstructorFunction;
}

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
export function expose(identifier: string) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor): void {
        const method = descriptor.value;
        let stored: Map<any, any> = Reflect.getMetadata(exposeMetadataKey, target);
        if (stored) {
            const oldBind = stored.get(identifier);
            if (oldBind) {
                console.log(
                    `warning: duplicated identifier detected! function identifier '${identifier}' is rebinded from ${oldBind} to ${method}`
                );
            }
            stored.set(identifier, method);
        } else {
            stored = new Map();
            stored.set(identifier, method);
        }
        Reflect.defineMetadata(exposeMetadataKey, stored, target);
    };
}

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
export function call(exposedFunctionIdentifier: string) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor): void {
        const originalMethod = descriptor.value;

        descriptor.value = function (...args: any[]) {
            const messagingInstance = Messaging.getInstance();
            if (messagingInstance) {
                messagingInstance.call(exposedFunctionIdentifier, ...args);
            }
            originalMethod(...args);
        };
    };
}
