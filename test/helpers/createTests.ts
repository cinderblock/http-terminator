/* eslint-disable @typescript-eslint/no-non-null-assertion */
import sinon from 'sinon';
import delay from 'delay';
import got from 'got';
import KeepAliveHttpAgent, {
  HttpsAgent as KeepAliveHttpsAgent,
} from 'agentkeepalive';
import createHttpTerminator from '../../src/factories/createHttpTerminator';
import { HttpServerFactoryType } from './createHttpServer';
import { HttpsServerFactoryType } from './createHttpsServer';

export default (
  createHttpServer: HttpServerFactoryType | HttpsServerFactoryType,
): void => {
  test('terminates HTTP server with no connections', async () => {
    const httpServer = await createHttpServer(() => {
      // Do nothing
    });

    expect(httpServer.server.listening).toBe(true);

    const terminator = createHttpTerminator({
      server: httpServer.server,
    });

    await terminator.terminate();

    expect(httpServer.server.listening).toBe(false);
  }, 100);

  test('terminates hanging sockets after gracefulTerminationTimeout', async () => {
    const spy = sinon.spy();

    const httpServer = await createHttpServer(() => {
      spy();
    });

    const terminator = createHttpTerminator({
      gracefulTerminationTimeout: 150,
      server: httpServer.server,
    });

    got(httpServer.url!);

    await delay(50);

    expect(spy.called).toBe(true);

    terminator.terminate();

    await delay(100);

    // The timeout has not passed.
    expect(await httpServer.getConnections()).toBe(1);

    await delay(100);

    expect(await httpServer.getConnections()).toBe(0);
  }, 500);

  test('server stops accepting new connections after terminator.terminate() is called', async () => {
    const stub = sinon.stub();

    stub.onCall(0).callsFake((incomingMessage, outgoingMessage) => {
      setTimeout(() => {
        outgoingMessage.end('foo');
      }, 100);
    });

    stub.onCall(1).callsFake((incomingMessage, outgoingMessage) => {
      outgoingMessage.end('bar');
    });

    const httpServer = await createHttpServer(stub);

    const terminator = createHttpTerminator({
      gracefulTerminationTimeout: 150,
      server: httpServer.server,
    });

    const request0 = got(httpServer.url!);

    await delay(50);

    terminator.terminate();

    await delay(50);

    const request1 = got(httpServer.url!, {
      retry: 0,
      timeout: {
        connect: 50,
      },
    });

    expect.assertions(1);

    // @todo https://stackoverflow.com/q/59832897/368691
    await expect(request1).rejects.toBe('foobar');

    const response0 = await request0;

    expect(response0.headers.connection).toBe('close');
    expect(response0.body).toBe('foo');
  }, 500);

  test('ongoing requests receive {connection: close} header', async () => {
    const httpServer = await createHttpServer(
      (incomingMessage, outgoingMessage) => {
        setTimeout(() => {
          outgoingMessage.end('foo');
        }, 100);
      },
    );

    const terminator = createHttpTerminator({
      gracefulTerminationTimeout: 150,
      server: httpServer.server,
    });

    const httpAgent = new KeepAliveHttpAgent({
      maxSockets: 1,
    });

    const httpsAgent = new KeepAliveHttpsAgent({
      maxSockets: 1,
    });

    const request = got(httpServer.url!, {
      agent: {
        http: httpAgent,
        https: httpsAgent,
      },
    });

    await delay(50);

    terminator.terminate();

    const response = await request;

    expect(response.headers.connection).toBe('close');
    expect(response.body).toBe('foo');
  }, 600);

  test('ongoing requests receive {connection: close} header (new request reusing an existing socket)', async () => {
    const stub = sinon.stub();

    stub.onCall(0).callsFake((incomingMessage, outgoingMessage) => {
      outgoingMessage.write('foo');

      setTimeout(() => {
        outgoingMessage.end('bar');
      }, 50);
    });

    stub.onCall(1).callsFake((incomingMessage, outgoingMessage) => {
      // @todo Unable to intercept the response without the delay.
      // When `end()` is called immediately, the `request` event
      // already has `headersSent=true`. It is unclear how to intercept
      // the response beforehand.
      setTimeout(() => {
        outgoingMessage.end('baz');
      }, 50);
    });

    const httpServer = await createHttpServer(stub);

    const terminator = createHttpTerminator({
      gracefulTerminationTimeout: 150,
      server: httpServer.server,
    });

    const httpAgent = new KeepAliveHttpAgent({
      maxSockets: 1,
    });

    const httpsAgent = new KeepAliveHttpsAgent({
      maxSockets: 1,
    });

    const request0 = got(httpServer.url!, {
      agent: {
        http: httpAgent,
        https: httpsAgent,
      },
    });

    await delay(50);

    terminator.terminate();

    const request1 = got(httpServer.url!, {
      agent: {
        http: httpAgent,
        https: httpsAgent,
      },
      retry: 0,
    });

    await delay(50);

    expect(stub.callCount).toBe(2);

    const response0 = await request0;

    expect(response0.headers.connection).toBe('keep-alive');
    expect(response0.body).toBe('foobar');

    const response1 = await request1;

    expect(response1.headers.connection).toBe('close');
    expect(response1.body).toBe('baz');
  }, 1000);

  test('does not send {connection: close} when server is not terminating', async () => {
    const httpServer = await createHttpServer(
      (incomingMessage, outgoingMessage) => {
        setTimeout(() => {
          outgoingMessage.end('foo');
        }, 50);
      },
    );

    createHttpTerminator({
      server: httpServer.server,
    });

    const httpAgent = new KeepAliveHttpAgent({
      maxSockets: 1,
    });

    const httpsAgent = new KeepAliveHttpsAgent({
      maxSockets: 1,
    });

    const response = await got(httpServer.url!, {
      agent: {
        http: httpAgent,
        https: httpsAgent,
      },
    });

    expect(response.headers.connection).toBe('keep-alive');
  }, 100);
};
