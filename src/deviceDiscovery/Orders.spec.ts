import { expect } from 'chai';
import { createSandbox } from 'sinon';
import { Orders } from './Orders';
import type { Order } from './Orders';

const sinon = createSandbox();

describe('Orders', () => {
    afterEach(() => {
        sinon.restore();
    });

    it('submit lands each order in its type\'s pending set and announces it', () => {
        const onSubmit = sinon.spy();
        const orders = new Orders(onSubmit);

        orders.submit([
            { type: 'broadcast', reason: 'network' },
            { type: 'reconcile', reason: 'config-changed' }
        ]);

        expect(orders.getPending('broadcast')).to.eql(['network']);
        expect(orders.getPending('reconcile')).to.eql(['config-changed']);
        expect(onSubmit.callCount).to.equal(2);
        expect(onSubmit.firstCall.args[0]).to.eql({ type: 'broadcast', reason: 'network' });
        expect(onSubmit.firstCall.args[1]).to.be.a('number');
    });

    it('the same reason never queues twice; different reasons accumulate', () => {
        const orders = new Orders(() => { });

        orders.submit([
            { type: 'broadcast', reason: 'stale' },
            { type: 'broadcast', reason: 'stale' },
            { type: 'broadcast', reason: 'sleep' }
        ]);

        expect(orders.getPending('broadcast')).to.have.members(['stale', 'sleep']);
    });

    it('take drains the whole set and returns one entry with every reason', () => {
        const orders = new Orders(() => { });
        orders.submit([
            { type: 'broadcast', reason: 'sleep' },
            { type: 'broadcast', reason: 'network' }
        ]);

        const taken = orders.take({ types: ['broadcast'] });

        expect(taken).to.have.length(1);
        expect(taken[0].type).to.equal('broadcast');
        expect(taken[0].reasons).to.have.members(['sleep', 'network']);
        expect(orders.getPending('broadcast')).to.be.empty;
    });

    it('take returns nothing and keeps the set when only excepted reasons are pending', () => {
        const orders = new Orders(() => { });
        orders.submit([{ type: 'broadcast', reason: 'stale' }]);

        expect(orders.take({ types: ['broadcast'], except: ['stale'] })).to.be.empty;
        expect(orders.getPending('broadcast')).to.eql(['stale']);
    });

    it('an excepted reason rides along when a non-excepted reason triggers the take', () => {
        const orders = new Orders(() => { });
        orders.submit([
            { type: 'broadcast', reason: 'stale' },
            { type: 'broadcast', reason: 'network' }
        ]);

        const taken = orders.take({ types: ['broadcast'], except: ['stale'] });

        expect(taken).to.have.length(1);
        expect(taken[0].reasons).to.have.members(['stale', 'network']);
        expect(orders.getPending('broadcast')).to.be.empty;
    });

    it('take is atomic per type: a second take finds nothing', () => {
        const orders = new Orders(() => { });
        orders.submit([{ type: 'reconcile', reason: 'network' }]);

        expect(orders.take({ types: ['reconcile'] })).to.eql([{ type: 'reconcile', reasons: ['network'] }]);
        expect(orders.take({ types: ['reconcile'] })).to.be.empty;
    });

    it('the two order types are independent', () => {
        const orders = new Orders(() => { });
        const submitted: Order[] = [
            { type: 'broadcast', reason: 'network' },
            { type: 'reconcile', reason: 'network' }
        ];
        orders.submit(submitted);

        expect(orders.take({ types: ['broadcast'] })).to.eql([{ type: 'broadcast', reasons: ['network'] }]);
        expect(orders.getPending('reconcile')).to.eql(['network']);
    });
});
