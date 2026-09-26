import { acquireSystemOneClient, clearSystemOneModelCache, resetSystemOneClientPool } from './system-one-browser';
import { SystemOneClient } from './system-one-agent';

function client(release: jasmine.Spy): SystemOneClient {
    return {
        systemOne: () => Promise.resolve({ answers: {} }),
        release: () => {
            release();
            return Promise.resolve();
        }
    };
}

describe('System One browser client pool', () => {
    afterEach(async () => resetSystemOneClientPool());

    it('shares one keyed model until its final lease is released', async () => {
        const released: jasmine.Spy = jasmine.createSpy('released');
        const first: SystemOneClient = client(released);
        const createFirst: jasmine.Spy = jasmine.createSpy('createFirst').and.returnValue(Promise.resolve(first));

        const firstLease = await acquireSystemOneClient('first:int8', createFirst);
        const secondLease = await acquireSystemOneClient('first:int8', createFirst);

        expect(firstLease.client).toBe(first);
        expect(secondLease.client).toBe(first);
        expect(createFirst).toHaveBeenCalledTimes(1);
        await firstLease.release();
        expect(released).not.toHaveBeenCalled();
        await secondLease.release();
        expect(released).toHaveBeenCalledTimes(1);
    });

    it('keeps differently keyed models alive at the same time', async () => {
        const releasedFirst: jasmine.Spy = jasmine.createSpy('releasedFirst');
        const releasedSecond: jasmine.Spy = jasmine.createSpy('releasedSecond');
        const firstLease = await acquireSystemOneClient(
            'first:int8', () => Promise.resolve(client(releasedFirst))
        );
        const secondLease = await acquireSystemOneClient(
            'second:int8', () => Promise.resolve(client(releasedSecond))
        );

        expect(releasedFirst).not.toHaveBeenCalled();
        expect(releasedSecond).not.toHaveBeenCalled();
        await firstLease.release();
        expect(releasedFirst).toHaveBeenCalledTimes(1);
        expect(releasedSecond).not.toHaveBeenCalled();
        await secondLease.release();
        expect(releasedSecond).toHaveBeenCalledTimes(1);
    });

    it('clears a rejected model load so the same key can retry', async () => {
        const expected: SystemOneClient = client(jasmine.createSpy('released'));
        let attempts = 0;
        const create = () => {
            attempts += 1;
            return attempts === 1 ? Promise.reject(new Error('failed')) : Promise.resolve(expected);
        };

        await expectAsync(acquireSystemOneClient('retry:int8', create)).toBeRejectedWithError('failed');
        const lease = await acquireSystemOneClient('retry:int8', create);
        expect(lease.client).toBe(expected);
        await lease.release();
        expect(attempts).toBe(2);
    });

    it('clears known model files without deleting unrelated cached responses', async () => {
        if (typeof caches === 'undefined') {
            return;
        }
        const name = 'system-one-clear-test';
        const cache = await caches.open(name);
        const modelUrl = 'https://huggingface.co/techtheist/laya-onnx/resolve/revision/model.onnx';
        const unrelatedUrl = 'https://example.com/application-data.json';
        await cache.put(modelUrl, new Response('model'));
        await cache.put(unrelatedUrl, new Response('application'));

        expect(await clearSystemOneModelCache()).toBe(1);
        expect(await cache.match(modelUrl)).toBeUndefined();
        expect(await cache.match(unrelatedUrl)).toBeDefined();
        await caches.delete(name);
    });
});
