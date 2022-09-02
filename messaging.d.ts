/********************************************************************************
 * Copyright (C) 2020. Huawei Technologies Co., Ltd. All rights reserved.
 * SPDX-License-Identifier: MIT
 ********************************************************************************/
import 'reflect-metadata';
export declare class Deferred<T> {
    resolve: (value?: T) => void;
    reject: (err?: any) => void;
    isPending: boolean;
    isFulfilled: boolean;
    isRejected: boolean;
    promise: Promise<T>;
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
export declare class Messaging {
    private static instance;
    private exposedFunctions;
    private pendingCalls;
    private executingCalls;
    private iframeContexts;
    readonly from: string;
    private constructor();
    static bind(iframeContext: IframeLike, clientId?: string): Messaging;
    static getInstance(): Messaging | undefined;
    private dispose;
    private sendRemoteCall;
    private onRemoteCall;
    /**
     * expose function to remote
     * exposed function can be called remotely using call(func: string, args: any[]): Promise<any>
     * @param func function to expose
     * @param identifier unique identifier for calling remotely
     */
    expose(func: <T>(...args: any[]) => Promise<T>, identifier?: string): void;
    /**
     * make a remote function call
     * @param func remote function name
     * @param args arguments passed to remote function
     */
    call(func: string, ...args: any[]): Promise<any>;
    getExposedFunctions(): Map<string, (...args: any[]) => Promise<any>>;
}
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
export declare function messaging(clientId?: string): <T extends new (...constructorArgs: any[]) => any>(constructorFunction: T) => any;
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
export declare function exposable<T extends new (...constructorArgs: any[]) => any>(constructorFunction: T): any;
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
export declare function expose(identifier: string): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void;
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
export declare function call(exposedFunctionIdentifier: string): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void;
