import { expect } from 'chai';
import { colorField } from './ColorField';

describe('ColorField', () => {
    describe('convertIntegerColorToRgb', () => {
        it('should convert integer known values from Roku to the proper colors', () => {
            const testCases = [{
                // #FFFFFFFF
                input: -1,
                expectedOutput: {
                    red: 255,
                    green: 255,
                    blue: 255,
                    alpha: 255
                }
            }, {
                // #000000FF
                input: 255,
                expectedOutput: {
                    red: 0,
                    green: 0,
                    blue: 0,
                    alpha: 255
                }
            }, {
                // #00000000
                input: 0,
                expectedOutput: {
                    red: 0,
                    green: 0,
                    blue: 0,
                    alpha: 0
                }
            }, {
                // #FFFFFF00
                input: -256,
                expectedOutput: {
                    red: 255,
                    green: 255,
                    blue: 255,
                    alpha: 0
                }
            }, {
                // #FF0000FF
                input: -16776961,
                expectedOutput: {
                    red: 255,
                    green: 0,
                    blue: 0,
                    alpha: 255
                }
            }, {
                // #00FF00FF
                input: 16711935,
                expectedOutput: {
                    red: 0,
                    green: 255,
                    blue: 0,
                    alpha: 255
                }
            }, {
                // #0000FFFF
                input: 65535,
                expectedOutput: {
                    red: 0,
                    green: 0,
                    blue: 255,
                    alpha: 255
                }
            }, {
                // #0000FF00
                input: 65280,
                expectedOutput: {
                    red: 0,
                    green: 0,
                    blue: 255,
                    alpha: 0
                }
            }];
            for (const { input, expectedOutput } of testCases) {
                const result = colorField.convertIntegerColorToRgb(input);
                expect(result.red).to.equal(expectedOutput.red);
                expect(result.green).to.equal(expectedOutput.green);
                expect(result.blue).to.equal(expectedOutput.blue);
                expect(result.alpha).to.equal(expectedOutput.alpha);
            }
        });
    });

    describe('convertHexPart', () => {
        it('should convert byte to the correct hexadecimal with correct casing', () => {
            const testCases = [{
                input: 255,
                expectedOutput: 'FF'
            }, {
                input: 0,
                expectedOutput: '00'
            }, {
                input: 150,
                expectedOutput: '96'
            }];
            for (const { input, expectedOutput } of testCases) {
                const result = colorField.convertHexPart(input);
                expect(result).to.equal(expectedOutput);
            }
        });
    });

    describe('convertRgbToHex', () => {
        it('should convert rgb representation to correct hexadecimal version', () => {
            const testCases = [{
                input: {
                    red: 255,
                    green: 255,
                    blue: 255,
                    alpha: 255
                },
                expectedOutput: '#FFFFFFFF'
            }, {
                input: {
                    red: 0,
                    green: 0,
                    blue: 0,
                    alpha: 255
                },
                expectedOutput: '#000000FF'
            }, {
                input: {
                    red: 0,
                    green: 0,
                    blue: 0,
                    alpha: 0
                },
                expectedOutput: '#00000000'
            }, {
                input: {
                    red: 255,
                    green: 255,
                    blue: 255,
                    alpha: 0
                },
                expectedOutput: '#FFFFFF00'
            }, {
                input: {
                    red: 255,
                    green: 0,
                    blue: 0,
                    alpha: 255
                },
                expectedOutput: '#FF0000FF'
            }, {
                input: {
                    red: 0,
                    green: 255,
                    blue: 0,
                    alpha: 255
                },
                expectedOutput: '#00FF00FF'
            }, {
                input: {
                    red: 0,
                    green: 0,
                    blue: 255,
                    alpha: 255
                },
                expectedOutput: '#0000FFFF'
            }, {
                input: {
                    red: 0,
                    green: 0,
                    blue: 255,
                    alpha: 0
                },
                expectedOutput: '#0000FF00'
            }];

            for (const { input, expectedOutput } of testCases) {
                const result = colorField.convertRgbToHex(input);
                expect(result).to.equal(expectedOutput);
            }
        });
    });
});
