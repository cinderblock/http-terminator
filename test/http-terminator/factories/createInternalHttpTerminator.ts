/* eslint-disable @typescript-eslint/no-non-null-assertion */
import sinon from 'sinon';
import delay from 'delay';
import got, { RequestError, NormalizedOptions } from 'got';
import KeepAliveHttpAgent from 'agentkeepalive';
import createHttpServer from '../../helpers/createHttpServer';
import createInternalHttpTerminator from '../../../src/factories/createInternalHttpTerminator';

describe('Internal Tests', () => {
  test('terminates HTTP server with no connections', async () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const httpServer = await createHttpServer(() => {});

    expect(httpServer.server.listening).toBe(true);

    const terminator = createInternalHttpTerminator({
      server: httpServer.server,
    });

    await terminator.terminate();

    expect(httpServer.server.listening).toBe(false);
  }, 100);

  test('terminates hanging sockets after httpResponseTimeout', async () => {
    const spy = sinon.spy();

    const httpServer = await createHttpServer(() => {
      spy();
    });

    const terminator = createInternalHttpTerminator({
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
    const httpServer = await createHttpServer(
      (incomingMessage, outgoingMessage) => {
        setTimeout(() => {
          outgoingMessage.end('foo');
        }, 100);
      },
    );

    const terminator = createInternalHttpTerminator({
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

    expect(request1).rejects.toBe(
      new RequestError(new Error('read ECONNRESET'), {} as NormalizedOptions),
    );

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

    const terminator = createInternalHttpTerminator({
      gracefulTerminationTimeout: 150,
      server: httpServer.server,
    });

    const request = got(httpServer.url!, {
      agent: {
        http: new KeepAliveHttpAgent(),
      },
    });

    await delay(50);

    terminator.terminate();

    const response = await request;

    expect(response.headers.connection).toBe('close');
    expect(response.body).toBe('foo');
  }, 500);

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

    const terminator = createInternalHttpTerminator({
      gracefulTerminationTimeout: 150,
      server: httpServer.server,
    });

    const agent = new KeepAliveHttpAgent({
      maxSockets: 1,
    });

    const request0 = got(httpServer.url!, {
      agent: {
        http: agent,
      },
    });

    await delay(50);

    terminator.terminate();

    const request1 = got(httpServer.url!, {
      agent: {
        http: agent,
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

  test('empties internal socket collection', async () => {
    const httpServer = await createHttpServer(
      (incomingMessage, outgoingMessage) => {
        outgoingMessage.end('foo');
      },
    );

    const terminator = createInternalHttpTerminator({
      gracefulTerminationTimeout: 150,
      server: httpServer.server,
    });

    await got(httpServer.url!);

    await delay(50);

    expect(terminator.sockets.size).toBe(0);
    expect(terminator.secureSockets.size).toBe(0);

    await terminator.terminate();
  }, 500);
});
