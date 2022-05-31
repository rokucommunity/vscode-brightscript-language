import { expect } from 'chai';
import { utils } from './utils';
import * as sinonImport from 'sinon';

describe('RDB utils', () => {
    describe('isObjectWithProperty', () => {
        it('should return true if the property exist', () => {
            const result = utils.isObjectWithProperty({
                itExists: 'yup'
            }, 'itExists');
            expect(result).to.be.true;
        });

        it('should return false if the property does not exist', () => {
            const result = utils.isObjectWithProperty({}, 'itDoesNotExist');
            expect(result).to.be.false;
        });

        it('should return false if null', () => {
            const result = utils.isObjectWithProperty(null, 'itDoesNotExist');
            expect(result).to.be.false;
        });
    });

    describe('storage', () => {
        const sinon = sinonImport.createSandbox();
        const utilsAccess = utils as any;
        let getStateReturn = '';
        beforeEach(() => {
            getStateReturn = '';
            utilsAccess.storage = undefined;
            sinon.stub(utilsAccess, 'getVscodeApi').callsFake(() => {
                return {
                    getState: () => getStateReturn,
                    setState: (message) => {}
                };
            });
        });
        afterEach(() => {
            sinon.restore();
        });

        describe('getStorageValue', () => {
            it('should return the stored value if it exists', () => {
                const storage = {
                    myValue: 42
                };
                getStateReturn = JSON.stringify(storage);
                const result = utils.getStorageValue('myValue');
                expect(result).to.equal(storage.myValue);
            });

            it('should return default value if the value was not found', () => {
                const defaultValue = 'defaultValue';
                const result = utils.getStorageValue('doesNotExist', defaultValue);
                expect(result).to.equal(defaultValue);
            });
        });

        describe('getStorageBooleanValue', () => {
            it('should return the stored value if it is a boolean', () => {
                const storage = {
                    myValue: true
                };
                getStateReturn = JSON.stringify(storage);
                const result = utils.getStorageBooleanValue('myValue');
                expect(result).to.equal(storage.myValue);
            });

            it('should return default value if the value was not a boolean', () => {
                const storage = {
                    myValue: 'notABoolean'
                };
                getStateReturn = JSON.stringify(storage);
                const result = utils.getStorageBooleanValue('myValue', true);
                expect(result).to.equal(true);
            });
        });

        describe('setStorageValue', () => {
            it('should store the value in storage', () => {
                expect(utils.getStorageValue('myValue')).to.be.null;
                const value = 'everybody wants to rule the world';
                utils.setStorageValue('myValue', value);
                expect(utils.getStorageValue('myValue')).to.equal(value);
            });
        });

        describe('deleteStorageValue', () => {
            it('should delete the requested storage value', () => {
                const value = 'destroyMe';
                utils.setStorageValue('myValue', value);
                expect(utils.getStorageValue('myValue')).to.equal(value);
                utils.deleteStorageValue('myValue');
                expect(utils.getStorageValue('myValue')).to.be.null;
            });
        });
    });
});
