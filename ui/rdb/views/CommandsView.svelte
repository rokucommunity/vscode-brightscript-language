<script>
    let requestArgsSchema = {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "anyOf": [
            {
                "$ref": "#/definitions/ODCCallFuncArgs"
            },
            {
                "$ref": "#/definitions/ODCGetFocusedNodeArgs"
            },
            {
                "$ref": "#/definitions/ODCGetValueAtKeyPathArgs"
            },
            {
                "$ref": "#/definitions/ODCGetValuesAtKeyPathsArgs"
            },
            {
                "$ref": "#/definitions/ODCHandshakeArgs"
            },
            {
                "$ref": "#/definitions/ODCHasFocusArgs"
            },
            {
                "$ref": "#/definitions/ODCIsInFocusChainArgs"
            },
            {
                "$ref": "#/definitions/ODCObserveFieldArgs"
            },
            {
                "$ref": "#/definitions/ODCSetValueAtKeyPathArgs"
            },
            {
                "$ref": "#/definitions/ODCReadRegistryArgs"
            },
            {
                "$ref": "#/definitions/ODCWriteRegistryArgs"
            },
            {
                "$ref": "#/definitions/ODCDeleteRegistrySectionsArgs"
            },
            {
                "$ref": "#/definitions/ODCDeleteEntireRegistrySectionsArgs"
            }
        ],
        "definitions": {
            "ODCCallFuncArgs": {
                "properties": {
                    "base": {
                        "$ref": "#/definitions/ODCKeyPathBaseTypes"
                    },
                    "funcName": {
                        "type": "string"
                    },
                    "funcParams": {
                        "items": {
                        },
                        "type": "array"
                    },
                    "keyPath": {
                        "type": "string"
                    }
                },
                "type": "object"
            },
            "ODCDeleteEntireRegistrySectionsArgs": {
                "type": "object"
            },
            "ODCDeleteRegistrySectionsArgs": {
                "properties": {
                    "allowEntireRegistryDelete": {
                        "type": "boolean"
                    },
                    "sections": {
                        "anyOf": [
                            {
                                "items": {
                                    "type": "string"
                                },
                                "type": "array"
                            },
                            {
                                "type": "string"
                            }
                        ]
                    }
                },
                "type": "object"
            },
            "ODCGetFocusedNodeArgs": {
                "type": "object"
            },
            "ODCGetValueAtKeyPathArgs": {
                "properties": {
                    "base": {
                        "$ref": "#/definitions/ODCKeyPathBaseTypes"
                    },
                    "keyPath": {
                        "type": "string"
                    },
                    "timeout": {
                        "type": "number"
                    }
                },
                "type": "object"
            },
            "ODCGetValuesAtKeyPathsArgs": {
                "properties": {
                    "requests": {
                        "additionalProperties": {
                            "$ref": "#/definitions/ODCGetValueAtKeyPathArgs"
                        },
                        "type": "object"
                    }
                },
                "type": "object"
            },
            "ODCHandshakeArgs": {
                "properties": {
                    "logLevel": {
                        "$ref": "#/definitions/ODCLogLevels"
                    },
                    "version": {
                        "type": "string"
                    }
                },
                "type": "object"
            },
            "ODCHasFocusArgs": {
                "properties": {
                    "base": {
                        "$ref": "#/definitions/ODCKeyPathBaseTypes"
                    },
                    "keyPath": {
                        "type": "string"
                    }
                },
                "type": "object"
            },
            "ODCIsInFocusChainArgs": {
                "properties": {
                    "base": {
                        "$ref": "#/definitions/ODCKeyPathBaseTypes"
                    },
                    "keyPath": {
                        "type": "string"
                    }
                },
                "type": "object"
            },
            "ODCKeyPathBaseTypes": {
                "enum": [
                    "global",
                    "scene"
                ],
                "type": "string"
            },
            "ODCLogLevels": {
                "enum": [
                    "debug",
                    "error",
                    "info",
                    "off",
                    "verbose",
                    "warn"
                ],
                "type": "string"
            },
            "ODCObserveFieldArgs": {
                "properties": {
                    "base": {
                        "$ref": "#/definitions/ODCKeyPathBaseTypes"
                    },
                    "keyPath": {
                        "type": "string"
                    },
                    "match": {
                        "anyOf": [
                            {
                                "properties": {
                                    "base": {
                                        "$ref": "#/definitions/ODCKeyPathBaseTypes",
                                        "description": "Specifies what the entry point is for this key path. Defaults to 'global' if not specified"
                                    },
                                    "keyPath": {
                                        "type": "string"
                                    },
                                    "value": {
                                        "type": [
                                            "string",
                                            "number",
                                            "boolean"
                                        ]
                                    }
                                },
                                "type": "object"
                            },
                            {
                                "type": [
                                    "string",
                                    "number",
                                    "boolean"
                                ]
                            }
                        ]
                    },
                    "retryInterval": {
                        "type": "number"
                    },
                    "retryTimeout": {
                        "type": "number"
                    }
                },
                "type": "object"
            },
            "ODCReadRegistryArgs": {
                "properties": {
                    "values": {
                        "additionalProperties": {
                            "anyOf": [
                                {
                                    "items": {
                                        "type": "string"
                                    },
                                    "type": "array"
                                },
                                {
                                    "type": "string"
                                }
                            ]
                        },
                        "type": "object"
                    }
                },
                "type": "object"
            },
            "ODCSetValueAtKeyPathArgs": {
                "properties": {
                    "base": {
                        "$ref": "#/definitions/ODCKeyPathBaseTypes"
                    },
                    "keyPath": {
                        "type": "string"
                    },
                    "value": {
                    }
                },
                "type": "object"
            },
            "ODCWriteRegistryArgs": {
                "properties": {
                    "values": {
                        "additionalProperties": {
                            "additionalProperties": {
                                "type": "string"
                            },
                            "type": "object"
                        },
                        "type": "object"
                    }
                },
                "type": "object"
            }
        }
    }

    function addCommand(functionName, argsKey, displayName) {
        if (!displayName) {
            displayName = functionName;
        }

        return {
            functionName: functionName,
            displayName: displayName,
            args: requestArgsSchema.definitions[argsKey]
        }
    }

    let commandList = [
        addCommand('callFunc', 'ODCCallFuncArgs'),
        addCommand('getFocusedNode', 'ODCGetFocusedNodeArgs'),
        addCommand('getValueAtKeyPath', 'ODCGetValueAtKeyPathArgs'),
        addCommand('hasFocus', 'ODCHasFocusArgs'),
        addCommand('isInFocusChain', 'ODCIsInFocusChainArgs'),
        addCommand('observeField', 'ODCObserveFieldArgs'),
        addCommand('setValueAtKeyPath', 'ODCSetValueAtKeyPathArgs'),
        addCommand('readRegistry', 'ODCReadRegistryArgs'),
        addCommand('writeRegistry', 'ODCWriteRegistryArgs'),
        addCommand('deleteRegistrySections', 'ODCDeleteRegistrySectionsArgs'),
        addCommand('deleteEntireRegistry', 'ODCDeleteEntireRegistrySectionsArgs'),
    ]

    let selected;
    // preselect the first item
    let commandArgs = convertArgs(commandList[0].args.properties);

    function onCommandChange() {
        commandArgs = convertArgs(selected.args.properties);
    }

    function convertArgs(rawArgs) {
        const args = [];
        for (const key in rawArgs) {
            let rawArg = rawArgs[key];
            // Handles references to other definitions in schema
            if (rawArg['$ref']) {
                const refParts = rawArg['$ref'].split("/");
                rawArg = requestArgsSchema;
                for (const key of refParts) {
                    if (key === '#') continue;
                    console.log('key', key);
                    rawArg = rawArg[key];
                }
                console.log('rawArg', rawArg);
            }
            args.push({
                ...rawArg,
                id: key
            });

            console.log('sd:', key, args);
        }
        return args;
    }
</script>

<style>
    label {
        display: inline;
        padding-right: 6px;
        font-weight: bold;
    }
</style>
<!-- svelte-ignore a11y-no-onchange -->
<select name="command" bind:value={selected} on:change={onCommandChange}>
{#each commandList as command}
    <option value="{command}">{command.displayName}</option>
{/each}
</select>
{#each commandArgs as args}
    <br><label for="{args.id}">{args.id}</label>
    {#if args.enum}
        <select name="{args.id}">
        {#each args.enum as value}
            <option>{value}</option>
        {/each}
        </select>
    {:else}
        <input name="{args.id}" placeholder="{args.type}" />
    {/if}
{/each}
<br><button text="">Send</button>
<hr />
<div id="response">

</div>
