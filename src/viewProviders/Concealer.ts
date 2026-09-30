import { Cache } from 'brighterscript/dist/Cache';
import { escapeRegex, isNullish } from '../util';

export class Concealer {
    /**
     * Conceals (scrambles/obfuscates) any of the specified keys across all string properties in the object
     */
    public concealObject(object: Record<string, any>, secretKeys: string[]) {
        const result = new Map<string, { value: string; originalValue: string }>();
        const secretValues = Object.entries(object)
            //only keep the non-blank string keys
            .filter(([key, value]) => secretKeys.includes(key) && typeof value === 'string' && value?.toString() !== '')
            .map(([, value]) => value) as string[];

        //build the initial result
        for (const [key, value] of Object.entries(object)) {
            result.set(key, {
                value: value,
                originalValue: value
            });
        }

        //do value transforms
        for (let [, entry] of result) {
            let { value } = entry;
            for (const secretValue of secretValues) {
                if (typeof value === 'string') {
                    const regexp = new RegExp(
                        //escape the regex, or use an unmatchable regex if unable to escape it
                        escapeRegex(secretValue) ?? /(?!)/,
                        'g'
                    );
                    entry.value = entry.value.replace(regexp, this.concealString(secretValue));
                }
            }
        }

        return result;
    }

    private concealCache = new Cache<string, string>();

    /**
     * Given a string, replace the alphanumeric characters with random values.
     * This is useful for things like scrambling a uuid
     */
    public concealString(text: string) {
        return this.concealCache.getOrAdd(text, () => {
            if (isNullish(text)) {
                return text;
            } else {
                return text.replace(/[a-z0-9]/ig, (match) => {
                    // is a number
                    if (parseInt(match)) {
                        return this.getRandomChar('0123456789');

                        //is an uppercase letter
                    } else if (match.toUpperCase() === match) {
                        return this.getRandomChar('ABCDEFGHIJKLMNOPQRSTUVWXYZ');

                        //is a lower case number
                    } else {
                        return this.getRandomChar('abcdefghijklmnopqrstuvwxyz');
                    }
                });
            }
        });
    }

    private getRandomChar(dictionary: string) {
        return dictionary.charAt(Math.floor(Math.random() * dictionary.length));
    }
}
