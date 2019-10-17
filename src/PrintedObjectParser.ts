export class PrintedObjectParser {
    constructor(private line: string) {
        this.parse();
    }
    private currentIndex: number;

    private key: string;
    private value: string;

    public get result() {
        return this.key && this.value ? {
            key: this.key,
            value: this.value
        } : undefined;
    }

    private take() {
        //iterate from right-to-left, since the rhs strings have quotes around them (but the lhs ones do not)
        return this.line[this.currentIndex--];
    }

    private peek() {
        return this.line[this.currentIndex];
    }

    /**
     * Indicates whether the index is at or past the end of the line
     */
    private isAtEnd() {
        return this.currentIndex >= this.line.length;
    }

    /**
     * get a string with all of the characters up to
     * @param stopChar
     */
    private takeUntil(stopChar: string, includeStopChar = true) {
        let result = '';
        while (this.peek() && this.peek() !== stopChar) {
            if (this.isAtEnd()) {
                return undefined;
            }
            result += this.take();
        }
        if (includeStopChar) {
            result += this.take();
        }
        return result;
    }

    /**
     * Take all whitespace chars until a non-whitespace char is found
     */
    private takeWhitespace() {
        let result = '';
        while (this.peek() === ' ' || this.peek() === '\t') {
            result += this.take();
        }
        return result;
    }

    private hasKey() {
        return !!this.key;
    }

    private hasValue() {
        return !!this.value;
    }

    private parse() {
        //throw out the beginning 4 characters of the line that roku always includes for object properties
        this.line = this.line.substring(4);

        this.currentIndex = this.line.length - 1;

        //trim right whitespace
        this.takeWhitespace();

        //try to get the value. All of these methods will immediately exit if value was already found
        {
            this.tryTakeStringValue();
            this.tryTakeComponentValue();
            this.tryTakeBasicValue();
        }

        //if we found a value, then the remaining characters are the key
        if (this.hasValue()) {
            //we process backwards, so reverse the value
            this.value = this.value.split('').reverse().join('').trim();
            this.takeKey();
        }
    }

    private tryTakeStringValue() {
        if (this.hasValue()) {
            return;
        }

        //TODO support complex strings like `"cat says "bark" like a dog"`

        //if ends with quote
        if (this.peek() === '"') {
            //very primative take (does not support quotes embedded inside quotes).
            //roku does not escape the quotes inside of quotes for this type of print, unfortunately

            //take the opening quote, and all chars up to (and including) the closing quote
            this.value = this.take() + this.takeUntil('"');
        }
    }

    private tryTakeComponentValue() {
        if (this.hasValue()) {
            return;
        }
        //if ends with greaterThan, this is a component reference
        if (this.peek() === '>') {
            //take until lessThan
            this.value = this.take() + this.takeUntil('<');
        }
    }

    /**
     * Look for basic values like int, boolean, and other non-string and non-object values.
     * These are going to be non-semicolon characters found to the right of a semicolon (i.e. `age: 123` or `isAlive: true`)
     */
    private tryTakeBasicValue() {
        if (this.hasValue()) {
            return;
        }
        this.value = this.takeUntil(':', false);
    }

    /**
     * Clean up the remaining characters, and use them as the key
     */
    private takeKey() {
        //throw out characters until we reach a colon
        this.takeUntil(':');
        this.key = this.line.substring(0, this.currentIndex + 1);
    }
}
