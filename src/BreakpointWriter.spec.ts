// tslint:disable:no-unused-expression
import { expect } from 'chai';
import { SourceMapConsumer } from 'source-map';

import { BreakpointWriter } from './BreakpointWriter';

describe('BreakpointWriter', () => {
    let writer: BreakpointWriter;
    beforeEach(() => {
        writer = new BreakpointWriter();
    });

    it('correctly injects standard breakpoints', () => {
        expect(writer.writeBreakpointsWithSourceMap(`
            function Main()
                print "Hello world"
            end function
        `, 'test.brs',
            [{
                line: 3,
                column: 5
            }]).code
        ).to.equal(`
            function Main()\nSTOP
                print "Hello world"
            end function
        `);
    });

    it('injects conditions', () => {
        expect(writer.writeBreakpointsWithSourceMap(`
            function Main()
                print "Hello world"
            end function
        `, 'test.brs',
            [{
                line: 3,
                column: 5,
                condition: 'age=1'
            }]).code
        ).to.equal(`
            function Main()\nif age=1 then : STOP : end if
                print "Hello world"
            end function
        `);
    });

    it('injects hit conditions', () => {
        expect(writer.writeBreakpointsWithSourceMap(`
            function Main()
                print "Hello world"
            end function
        `, 'test.brs',
            [{
                line: 3,
                column: 5,
                hitCondition: '1'
            }]).code
        ).to.equal(`
            function Main()\nif Invalid = m.vscode_bp OR Invalid = m.vscode_bp.bp1 then if Invalid = m.vscode_bp then m.vscode_bp = {bp1: 0} else m.vscode_bp.bp1 = 0 else m.vscode_bp.bp1 ++ : if m.vscode_bp.bp1 >= 1 then STOP
                print "Hello world"
            end function
        `);
    });

    it('injects regular stop when hit condition is 0', () => {
        expect(writer.writeBreakpointsWithSourceMap(`
            function Main()
                print "Hello world"
            end function
        `, 'test.brs',
            [{
                line: 3,
                column: 5,
                hitCondition: '0'
            }]).code
        ).to.equal(`
            function Main()\nSTOP
                print "Hello world"
            end function
        `);
    });

    it('injects logMessage', () => {
        expect(writer.writeBreakpointsWithSourceMap(`
            function Main()
                print "Hello world"
            end function
        `, 'test.brs',
            [{
                line: 3,
                column: 5,
                logMessage: 'test print'
            }]).code
        ).to.equal(`
            function Main()\nPRINT "test print"
                print "Hello world"
            end function
        `);
    });

    it('injects logMessage with interpolated values', () => {
        expect(writer.writeBreakpointsWithSourceMap(`
            function Main()
                print "Hello world"
            end function
        `, 'test.brs',
            [{
                line: 3,
                column: 5,
                logMessage: 'hello {name}, how is {city}'
            }]).code
        ).to.equal(`
            function Main()\nPRINT "hello "; name;", how is "; city;""
                print "Hello world"
            end function
        `);
    });

    it('generates valid source map', async () => {
        let result = writer.writeBreakpointsWithSourceMap(`
            function Main()
                print "Hello world"
            end function
        `, 'test.brs', [{ line: 3, column: 5 }]);
        expect(result.map).to.exist;

        //validate that the source map is correct
        await SourceMapConsumer.with(result.map.toString(), null, (consumer) => {
            expect(consumer.originalPositionFor({
                line: 4,
                column: 0
            })).contain({
                line: 3
            });
        });
    });
});
