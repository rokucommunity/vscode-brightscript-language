import { expect } from 'chai';
import { CredentialStore } from './CredentialStore';

describe('CredentialStore', () => {
    let store: CredentialStore;
    let storage: Record<string, any>;

    beforeEach(() => {
        storage = {};
        const mockContext: any = {
            globalState: {
                get: (key: string) => storage[key],
                update: (key: string, value: any) => {
                    if (value === undefined) {
                        delete storage[key];
                    } else {
                        storage[key] = value;
                    }
                    return Promise.resolve();
                }
            }
        };
        store = new CredentialStore(mockContext);
    });

    describe('getPassword', () => {
        it('returns undefined when no password stored for the serial number', async () => {
            expect(await store.getPassword('SN-001')).to.be.undefined;
        });

        it('returns undefined when the serial number is empty', async () => {
            expect(await store.getPassword('')).to.be.undefined;
        });

        it('returns undefined when the serial number is undefined', async () => {
            expect(await store.getPassword(undefined)).to.be.undefined;
        });
    });

    describe('setPassword', () => {
        it('stores and retrieves a password', async () => {
            await store.setPassword('SN-001', 'hunter2');
            expect(await store.getPassword('SN-001')).to.equal('hunter2');
        });

        it('overwrites an existing password for the same serial number', async () => {
            await store.setPassword('SN-001', 'old');
            await store.setPassword('SN-001', 'new');
            expect(await store.getPassword('SN-001')).to.equal('new');
        });

        it('stores passwords for multiple devices independently', async () => {
            await store.setPassword('SN-001', 'one');
            await store.setPassword('SN-002', 'two');
            expect(await store.getPassword('SN-001')).to.equal('one');
            expect(await store.getPassword('SN-002')).to.equal('two');
        });

        it('allows storing an empty password distinct from "not set"', async () => {
            await store.setPassword('SN-001', '');
            expect(await store.getPassword('SN-001')).to.equal('');
            expect(await store.getPassword('SN-002')).to.be.undefined;
        });

        it('throws when the serial number is empty', async () => {
            let threw = false;
            try {
                await store.setPassword('', 'pwd');
            } catch {
                threw = true;
            }
            expect(threw).to.be.true;
        });
    });

    describe('clearPassword', () => {
        it('removes a stored password', async () => {
            await store.setPassword('SN-001', 'hunter2');
            await store.clearPassword('SN-001');
            expect(await store.getPassword('SN-001')).to.be.undefined;
        });

        it('does not affect other entries', async () => {
            await store.setPassword('SN-001', 'one');
            await store.setPassword('SN-002', 'two');
            await store.clearPassword('SN-001');
            expect(await store.getPassword('SN-002')).to.equal('two');
        });

        it('is a no-op for an unknown serial number', async () => {
            await store.setPassword('SN-001', 'one');
            await store.clearPassword('SN-999');
            expect(await store.getPassword('SN-001')).to.equal('one');
        });

        it('is a no-op for an empty serial number', async () => {
            await store.setPassword('SN-001', 'one');
            await store.clearPassword('');
            expect(await store.getPassword('SN-001')).to.equal('one');
        });
    });

    describe('listSerialNumbersWithPasswords', () => {
        it('returns an empty array when no passwords are stored', async () => {
            expect(await store.listSerialNumbersWithPasswords()).to.deep.equal([]);
        });

        it('returns the serial numbers of every stored entry', async () => {
            await store.setPassword('SN-001', 'one');
            await store.setPassword('SN-002', 'two');
            expect((await store.listSerialNumbersWithPasswords()).sort()).to.deep.equal(['SN-001', 'SN-002']);
        });

        it('excludes cleared entries', async () => {
            await store.setPassword('SN-001', 'one');
            await store.setPassword('SN-002', 'two');
            await store.clearPassword('SN-001');
            expect(await store.listSerialNumbersWithPasswords()).to.deep.equal(['SN-002']);
        });
    });

    describe('clearAll', () => {
        it('removes every stored password', async () => {
            await store.setPassword('SN-001', 'one');
            await store.setPassword('SN-002', 'two');
            await store.clearAll();
            expect(await store.listSerialNumbersWithPasswords()).to.deep.equal([]);
        });
    });
});
