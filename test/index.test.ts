import { Deferred, messaging, exposable, expose, Messaging } from '../messaging';
import { expect } from 'chai';
import { v4 as uuid } from 'uuid';

describe('test expose function', () => {
    let messageReceived = new Deferred<any>();

    @messaging('client')
    class ClientA {
        private messageHandler?: (message: any) => void;
        private disposedEventHandler?: (...args: any[]) => void;
        registerMessageHandler(messageHandler: (message: any) => void) {
            this.messageHandler = messageHandler;
        }
        postMessage(message: any) {
            messageReceived.resolve(message);
        }
        onMessage(message: any) {
            if (this.messageHandler) {
                this.messageHandler(message);
            }
        }
        onDispose(disposedEventHandler: (...args: any[]) => void) {
            this.disposedEventHandler = disposedEventHandler;
        }
        dispose() {
            if (this.disposedEventHandler) {
                this.disposedEventHandler();
            }
        }
    }

    @exposable
    class Api4ClientA {
        @expose('myFunc')
        public myFunc(arg: string) {
            return `myFunc called with arg '${arg}'`;
        }
        @expose('myFuncThrowError')
        public myFuncThrowError() {
            throw new Error('err message');
        }
    }
    const clientA = new ClientA();
    const api4ClientA = new Api4ClientA();

    beforeEach(() => {
        messageReceived = new Deferred<any>();
    });

    it('test expose function', () => {
        const messageInstance = Messaging.getInstance();
        expect(messageInstance).not.undefined;
        if (messageInstance) {
            const exposedFunctions = messageInstance.getExposedFunctions();
            expect(exposedFunctions).to.include.all.keys('myFunc', 'myFuncThrowError');
        }
    });

    it('test function call retrun message', () => {
        expect(clientA).not.undefined;
        expect(api4ClientA).not.undefined;
        const functionCallId = uuid();
        const functionCallArgs = ['arg1'];
        const remoteFunc = 'client::myFunc';
        clientA.onMessage({
            id: functionCallId,
            func: remoteFunc,
            args: functionCallArgs,
            notify: false,
            from: 'test-client',
            to: 'client'
        });
        return messageReceived.promise.then((message) => {
            expect(message.id).to.equal(functionCallId);
            expect(message.success).to.be.true;
            expect(message.notify).to.be.true;
            expect(message.ret).to.equal(`myFunc called with arg '${functionCallArgs}'`);
        });
    });

    it('test function call without exposed', () => {
        expect(clientA).not.undefined;
        expect(api4ClientA).not.undefined;
        const functionCallId = uuid();
        const functionCallArgs = ['arg1'];
        const remoteFunc = 'client::anyFunc';
        clientA.onMessage({
            id: functionCallId,
            func: remoteFunc,
            args: functionCallArgs,
            notify: false,
            from: 'test-client',
            to: 'client'
        });
        return messageReceived.promise.then((message) => {
            expect(message.id).to.equal(functionCallId);
            expect(message.success).to.be.false;
            expect(message.notify).to.be.true;
            expect(message.ret).to.equal(`no function exposed as ${remoteFunc}`);
        });
    });

    it('test function call identifier without scope specified', () => {
        expect(clientA).not.undefined;
        expect(api4ClientA).not.undefined;
        const functionCallId = uuid();
        const functionCallArgs = ['arg1'];
        const remoteFunc = 'myFunc';
        clientA.onMessage({
            id: functionCallId,
            func: remoteFunc,
            args: functionCallArgs,
            notify: false,
            from: 'test-client',
            to: 'client'
        });
        return messageReceived.promise.then((message) => {
            expect(message.id).to.equal(functionCallId);
            expect(message.success).to.be.true;
            expect(message.notify).to.be.true;
            expect(message.ret).to.equal(`myFunc called with arg '${functionCallArgs}'`);
        });
    });

    it('test function call throws error', () => {
        expect(clientA).not.undefined;
        expect(api4ClientA).not.undefined;
        const functionCallId = uuid();
        const remoteFunc = 'myFuncThrowError';
        clientA.onMessage({
            id: functionCallId,
            func: remoteFunc,
            notify: false,
            from: 'test-client',
            to: 'client'
        });
        return messageReceived.promise.then((message) => {
            expect(message.id).to.equal(functionCallId);
            expect(message.success).to.be.false;
            expect(message.notify).to.be.true;
            expect(typeof message.ret).to.equal('object');
            expect(message.ret.stack).not.undefined;
            expect(message.ret.message).that.equal('err message');
        });
    });
});
