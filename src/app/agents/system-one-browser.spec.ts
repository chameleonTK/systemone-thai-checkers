import { loadExclusiveSystemOneClient, resetSystemOneClientPool } from './system-one-browser';
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

    it('reuses one model and releases it before another model is instantiated', async () => {
        const released: jasmine.Spy = jasmine.createSpy('released');
        const first: SystemOneClient = client(released);
        const createFirst: jasmine.Spy = jasmine.createSpy('createFirst').and.returnValue(Promise.resolve(first));
        const createSecond: jasmine.Spy = jasmine.createSpy('createSecond')
            .and.returnValue(Promise.resolve(client(jasmine.createSpy('releasedSecond'))));

        expect(await loadExclusiveSystemOneClient('first:int8', createFirst)).toBe(first);
        expect(await loadExclusiveSystemOneClient('first:int8', createFirst)).toBe(first);
        await loadExclusiveSystemOneClient('second:int8', createSecond);

        expect(createFirst).toHaveBeenCalledTimes(1);
        expect(released).toHaveBeenCalledTimes(1);
        expect(createSecond).toHaveBeenCalledTimes(1);
    });

    it('clears a rejected model load so the same key can retry', async () => {
        const expected: SystemOneClient = client(jasmine.createSpy('released'));
        let attempts = 0;
        const create = () => {
            attempts += 1;
            return attempts === 1 ? Promise.reject(new Error('failed')) : Promise.resolve(expected);
        };

        await expectAsync(loadExclusiveSystemOneClient('retry:int8', create)).toBeRejectedWithError('failed');
        expect(await loadExclusiveSystemOneClient('retry:int8', create)).toBe(expected);
        expect(attempts).toBe(2);
    });
});
