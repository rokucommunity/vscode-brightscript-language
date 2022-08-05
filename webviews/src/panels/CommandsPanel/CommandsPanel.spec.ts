import { expect } from 'chai';
import { commandsPanel } from './CommandsPanel';

describe('CommandsPanel', () => {
    const requestArgsSchema = {
        'definitions': {
            'MatchObject': {
                'properties': {
                    'base': {
                        '$ref': '#/definitions/ODC.BaseTypes',
                        'description': 'Specifies what the entry point is for this key path. Defaults to \'global\' if not specified'
                    },
                    'convertResponseToJsonCompatible': {
                        'description': 'We have to convert nodes before converting to json. If this isn\'t needed then it causes a fairly significant overhead',
                        'type': 'boolean'
                    },
                    'key': {
                        'description': 'If base is \'nodeRef\' this is the key that we used to store the node references on. If one isn\'t provided we use the automatically generated one',
                        'type': 'string'
                    },
                    'keyPath': {
                        'description': 'Holds the hierarchy value with each level separated by dot for ex: videoNode.title to what you are interested in getting the value from or written to.',
                        'type': 'string'
                    },
                    'responseMaxChildDepth': {
                        'description': 'Controls how deep we\'ll recurse into node\'s tree structure. Defaults to 0',
                        'type': 'number'
                    },
                    'value': {
                        'description': 'If the match value is passed in then the observer will be fired when the field value equals to the value in match',
                        'type': [
                            'string',
                            'number',
                            'boolean'
                        ]
                    }
                },
                'propertyOrder': [
                    'value',
                    'keyPath',
                    'convertResponseToJsonCompatible',
                    'base',
                    'key',
                    'responseMaxChildDepth'
                ],
                'type': 'object'
            },
            'ODC.BaseTypes': {
                'enum': [
                    'global',
                    'nodeRef',
                    'scene'
                ],
                'type': 'string'
            }
        }
    };

    describe('convertArgs', () => {
        it('should return as an array with the correct count', () => {
            const result = commandsPanel.convertArgs(requestArgsSchema.definitions.MatchObject, requestArgsSchema);
            expect(result.length).to.equal(6);
        });

        it('should work correctly with direct entries', () => {
            const result = commandsPanel.convertArgs(requestArgsSchema.definitions.MatchObject, requestArgsSchema);
            const refResult = result[1];
            expect(refResult.id).to.equal('keyPath');
            expect(refResult.type).to.equal('string');
        });

        it('should work correctly with ref entries', () => {
            const result = commandsPanel.convertArgs(requestArgsSchema.definitions.MatchObject, requestArgsSchema);
            const refResult = result[3];
            expect(refResult.id).to.equal('base');
            expect(refResult.type).to.equal('string');
        });

        it('should return an empty array if it is missing propertyOrder or properties', () => {
            let input;
            input = {
                propertyOrder: requestArgsSchema.definitions.MatchObject.propertyOrder
            };
            let result = commandsPanel.convertArgs(input, requestArgsSchema);
            expect(result).to.be.an.instanceOf(Array);

            input = {
                properties: requestArgsSchema.definitions.MatchObject.properties
            };
            result = commandsPanel.convertArgs(input, requestArgsSchema);
            expect(result).to.be.an.instanceOf(Array);
        });
    });

    describe('processArgToSendToExtension', () => {
        it('should handle boolean values correctly', () => {
            expect(commandsPanel.processArgToSendToExtension('boolean', 'true')).to.equal(true);
            expect(commandsPanel.processArgToSendToExtension('boolean', 'false')).to.equal(false);
        });

        it('should handle object values correctly', () => {
            const result = commandsPanel.processArgToSendToExtension('object', '{"a": 1}');
            expect(result.a).to.equal(1);
        });

        it('should handle array values correctly', () => {
            const result = commandsPanel.processArgToSendToExtension('array', '["a", "b"]');
            expect(result[0]).to.equal('a');
            expect(result[1]).to.equal('b');
        });

        it('should handle number values correctly', () => {
            expect(commandsPanel.processArgToSendToExtension('number', '1')).to.equal(1);
            expect(commandsPanel.processArgToSendToExtension('number', '1.5')).to.equal(1.5);
        });

        it('string values should be passed through directly', () => {
            const value = 'foo';
            expect(commandsPanel.processArgToSendToExtension('string', value)).to.equal(value);
        });
    });

});
