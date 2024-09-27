import { expect } from 'chai';

export function expectThrows(callback: () => any, expectedMessage: string | undefined = undefined, failedTestMessage = 'Expected to throw but did not') {
    let wasExceptionThrown = false;
    try {
        callback();
    } catch (e) {
        wasExceptionThrown = true;
        if (expectedMessage) {
            expect(e.message).to.eql(expectedMessage);
        }
    }
    if (wasExceptionThrown === false) {
        throw new Error(failedTestMessage);
    }
}


export async function expectThrowsAsync(callback: () => any, expectedMessage: string | undefined = undefined, failedTestMessage = 'Expected to throw but did not') {
    let wasExceptionThrown = false;
    try {
        await Promise.resolve(callback());
    } catch (e) {
        wasExceptionThrown = true;
        if (expectedMessage) {
            expect(e.message).to.eql(expectedMessage);
        }
    }
    if (wasExceptionThrown === false) {
        throw new Error(failedTestMessage);
    }
}
