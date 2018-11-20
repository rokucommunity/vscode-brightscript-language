import {
    BrightScriptLexer,
    CompositeKeywordTokenTypes,
    KeywordTokenTypes,
    Token,
    TokenType
} from 'brightscript-parser';
import * as trimRight from 'trim-right';

export class BrightScriptFormatter {
    constructor() { }
    /**
     * The default number of spaces when indenting with spaces
     */
    private static DEFAULT_INDENT_SPACE_COUNT = 4;
    /**
     * Format the given input.
     * @param inputText the text to format
     * @param formattingOptions options specifying formatting preferences
     */
    public format(inputText: string, formattingOptions?: FormattingOptions) {
        let options = this.normalizeOptions(formattingOptions);
        let lexer = new BrightScriptLexer();
        let tokens = lexer.tokenize(inputText);

        //force all composite keywords to have 0 or 1 spaces in between, but no more than 1
        tokens = this.normalizeCompositeKeywords(tokens);

        if (options.compositeKeywords) {
            tokens = this.formatCompositeKeywords(tokens, options);
        }

        if (options.indentStyle) {
            tokens = this.formatIndentation(tokens, options);
        }

        if (options.keywordCase) {
            tokens = this.formatKeywordCasing(tokens, options);
        }
        if (options.removeTrailingWhiteSpace) {
            tokens = this.formatTrailingWhiteSpace(tokens, options);
        }

        //join all tokens back together into a single string
        let outputText = '';
        for (let token of tokens) {
            outputText += token.value;
        }
        return outputText;
    }

    /**
     * Remove all whitespace in the composite keyword tokens with a single space
     * @param tokens
     */
    private normalizeCompositeKeywords(tokens: Token[]) {
        let indexOffset = 0;
        for (let token of tokens) {
            token.startIndex += indexOffset;
            //is this a composite token
            if (CompositeKeywordTokenTypes.indexOf(token.tokenType) > -1) {
                let value = token.value;
                //remove all whitespace with a single space
                token.value.replace(/s+/g, ' ');
                let indexDifference = value.length - token.value.length;
                indexOffset -= indexDifference;
            }
        }
        return tokens;
    }

    private formatCompositeKeywords(tokens: Token[], options: FormattingOptions) {
        let indexOffset = 0;
        for (let token of tokens) {
            token.startIndex += indexOffset;
            //is this a composite token
            if (CompositeKeywordTokenTypes.indexOf(token.tokenType) > -1) {
                let parts = this.getCompositeKeywordParts(token);
                let tokenValue = token.value;
                if (options.compositeKeywords === 'combine') {
                    token.value = parts[0] + parts[1];
                } else {
                    // if(options.compositeKeywords === 'split'){
                    token.value = parts[0] + ' ' + parts[1];
                }
                let offsetDifference = token.value.length - tokenValue.length;
                indexOffset += offsetDifference;
            }
        }
        return tokens;
    }

    private getCompositeKeywordParts(token: Token) {
        let lowerValue = token.value.toLowerCase();
        //split the parts of the token, but retain their case
        if (lowerValue.indexOf('end') === 0) {
            return [token.value.substring(0, 3), token.value.substring(3).trim()];
        } else if (lowerValue.indexOf('#else') === 0) {
            return [token.value.substring(0, 5), token.value.substring(5).trim()];
        } else {
            // if (lowerValue.indexOf('exit') === 0 || lowerValue.indexOf('else') === 0) {
            return [token.value.substring(0, 4), token.value.substring(4).trim()];
        }
    }

    private formatKeywordCasing(tokens: Token[], options: FormattingOptions) {
        for (let token of tokens) {
            //if this token is a keyword
            if (KeywordTokenTypes.indexOf(token.tokenType) > -1) {
                switch (options.keywordCase) {
                    case 'lower':
                        token.value = token.value.toLowerCase();
                        break;
                    case 'upper':
                        token.value = token.value.toUpperCase();
                        break;
                    case 'title':
                        let lowerValue = token.value.toLowerCase();
                        if (CompositeKeywordTokenTypes.indexOf(token.tokenType) === -1) {
                            token.value =
                                token.value.substring(0, 1).toUpperCase() +
                                token.value.substring(1).toLowerCase();
                        } else {
                            let spaceCharCount = (lowerValue.match(/\s+/) || []).length;
                            let firstWordLength: number = 0;
                            if (lowerValue.indexOf('end') === 0) {
                                firstWordLength = 3;
                            } else {
                                //if (lowerValue.indexOf('exit') > -1 || lowerValue.indexOf('else') > -1)
                                firstWordLength = 4;
                            }
                            token.value =
                                //first character
                                token.value.substring(0, 1).toUpperCase() +
                                //rest of first word
                                token.value.substring(1, firstWordLength).toLowerCase() +
                                //add back the whitespace
                                token.value.substring(
                                    firstWordLength,
                                    firstWordLength + spaceCharCount
                                ) +
                                //first character of second word
                                token.value
                                    .substring(
                                        firstWordLength + spaceCharCount,
                                        firstWordLength + spaceCharCount + 1
                                    )
                                    .toUpperCase() +
                                //rest of second word
                                token.value
                                    .substring(firstWordLength + spaceCharCount + 1)
                                    .toLowerCase();
                        }
                }
            }
        }
        return tokens;
    }

    private formatIndentation(tokens: Token[], options: FormattingOptions) {
        let indentTokens = [
            TokenType.sub,
            TokenType.for,
            TokenType.function,
            TokenType.if,
            TokenType.openCurlyBraceSymbol,
            TokenType.openSquareBraceSymbol,
            TokenType.while,
            TokenType.condIf
        ];
        let outdentTokens = [
            TokenType.closeCurlyBraceSymbol,
            TokenType.closeSquareBraceSymbol,
            TokenType.endFunction,
            TokenType.endIf,
            TokenType.endSub,
            TokenType.endWhile,
            TokenType.endFor,
            TokenType.next,
            TokenType.condEndIf
        ];
        let interumTokens = [
            TokenType.else,
            TokenType.elseIf,
            TokenType.condElse,
            TokenType.condElseIf
        ];
        let tabCount = 0;

        let nextLineStartTokenIndex = 0;
        //the list of output tokens
        let outputTokens: Token[] = [];
        //set the loop to run for a max of double the number of tokens we found so we don't end up with an infinite loop
        outer: for (
            let outerLoopCounter = 0;
            outerLoopCounter <= tokens.length * 2;
            outerLoopCounter++
        ) {
            let lineObj = this.getLineTokens(nextLineStartTokenIndex, tokens);

            nextLineStartTokenIndex = lineObj.stopIndex + 1;
            let lineTokens = lineObj.tokens;
            let thisTabCount = tabCount;
            let foundIndentorThisLine = false;

            //if this is a single-line if statement, do nothing with indentation
            if (this.isSingleLineIfStatement(lineTokens, tokens)) {
                // //if this line has a return statement, outdent
                // if (this.tokenIndexOf(TokenType.return, lineTokens) > -1) {
                //     tabCount--;
                // } else {
                //     //do nothing with single-line if statement indentation
                // }
            } else {
                for (let token of lineTokens) {
                    //if this is an indentor token,
                    if (indentTokens.indexOf(token.tokenType) > -1) {
                        tabCount++;
                        foundIndentorThisLine = true;

                        //this is an outdentor token
                    } else if (outdentTokens.indexOf(token.tokenType) > -1) {
                        tabCount--;
                        if (foundIndentorThisLine === false) {
                            thisTabCount--;
                        }

                        //this is an interum token
                    } else if (interumTokens.indexOf(token.tokenType) > -1) {
                        //these need outdented, but don't change the tabCount
                        thisTabCount--;
                    }
                    //  else if (token.tokenType === TokenType.return && foundIndentorThisLine) {
                    //     //a return statement on the same line as an indentor means we don't want to indent
                    //     tabCount--;
                    // }
                }
            }
            //if the tab counts are less than zero, something is wrong. However, at least try to do formatting as best we can by resetting to 0
            thisTabCount = thisTabCount < 0 ? 0 : thisTabCount;
            tabCount = tabCount < 0 ? 0 : tabCount;

            let leadingWhitespace: string;

            if (options.indentStyle === 'spaces') {
                let indentSpaceCount = options.indentSpaceCount
                    ? options.indentSpaceCount
                    : BrightScriptFormatter.DEFAULT_INDENT_SPACE_COUNT;
                let spaceCount = thisTabCount * indentSpaceCount;
                leadingWhitespace = Array(spaceCount + 1).join(' ');
            } else {
                leadingWhitespace = Array(thisTabCount + 1).join('\t');
            }
            //create a whitespace token if there isn't one
            if (lineTokens[0] && lineTokens[0].tokenType !== TokenType.whitespace) {
                lineTokens.unshift({
                    startIndex: -1,
                    tokenType: TokenType.whitespace,
                    value: ''
                });
            }

            //replace the whitespace with the formatted whitespace
            lineTokens[0].value = leadingWhitespace;

            //add this list of tokens
            outputTokens.push.apply(outputTokens, lineTokens);
            //if we have found the end of file
            if (
                lineTokens[lineTokens.length - 1].tokenType === TokenType.END_OF_FILE
            ) {
                break outer;
            }
            /* istanbul ignore next */
            if (outerLoopCounter === tokens.length * 2) {
                throw new Error('Something went terribly wrong');
            }
        }
        return outputTokens;
    }

    /**
     * Remove all trailing whitespace
     */
    private formatTrailingWhiteSpace(
        tokens: Token[],
        options: FormattingOptions
    ) {
        let nextLineStartTokenIndex = 0;
        //the list of output tokens
        let outputTokens: Token[] = [];

        //set the loop to run for a max of double the number of tokens we found so we don't end up with an infinite loop
        for (
            let outerLoopCounter = 0;
            outerLoopCounter <= tokens.length * 2;
            outerLoopCounter++
        ) {
            let lineObj = this.getLineTokens(nextLineStartTokenIndex, tokens);

            nextLineStartTokenIndex = lineObj.stopIndex + 1;
            let lineTokens = lineObj.tokens;
            //the last token is newline or EOF, so the next-to-last token is where the trailing whitespace would reside
            let potentialWhitespaceTokenIndex = lineTokens.length - 2;

            let whitespaceTokenCandidate = lineTokens[potentialWhitespaceTokenIndex];
            //if the final token is whitespace, throw it away
            if (whitespaceTokenCandidate.tokenType === TokenType.whitespace) {
                lineTokens.splice(potentialWhitespaceTokenIndex, 1);

                //if the final token is a comment, trim the whitespace from the righthand side
            } else if (
                whitespaceTokenCandidate.tokenType === TokenType.quoteComment ||
                whitespaceTokenCandidate.tokenType === TokenType.remComment
            ) {
                whitespaceTokenCandidate.value = trimRight(
                    whitespaceTokenCandidate.value
                );
            }

            //add this line to the output
            outputTokens.push.apply(outputTokens, lineTokens);

            //if we have found the end of file, quit the loop
            if (
                lineTokens[lineTokens.length - 1].tokenType === TokenType.END_OF_FILE
            ) {
                break;
            }
        }
        return outputTokens;
    }

    private tokenIndexOf(tokenType: TokenType, tokens: Token[]) {
        for (let i = 0; i < tokens.length; i++) {
            let token = tokens[i];
            if (token.tokenType === tokenType) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Get the tokens for the whole line starting at the given index (including the newline or EOF token at the end)
     * @param startIndex
     * @param tokens
     */
    private getLineTokens(startIndex: number, tokens: Token[]) {
        let outputTokens: Token[] = [];
        let index = startIndex;
        for (index = startIndex; index < tokens.length; index++) {
            let token = tokens[index];
            outputTokens[outputTokens.length] = token;

            if (
                token.tokenType === TokenType.newline ||
                token.tokenType === TokenType.END_OF_FILE
            ) {
                break;
            }
        }
        return {
            startIndex,
            stopIndex: index,
            tokens: outputTokens
        };
    }

    private normalizeOptions(options: FormattingOptions | undefined) {
        let fullOptions: FormattingOptions = {
            indentStyle: 'spaces',
            indentSpaceCount: BrightScriptFormatter.DEFAULT_INDENT_SPACE_COUNT,
            keywordCase: 'lower',
            compositeKeywords: 'split',
            removeTrailingWhiteSpace: true
        };
        if (options) {
            for (let attrname in options) {
                fullOptions[attrname] = options[attrname];
            }
        }
        return fullOptions;
    }

    private isSingleLineIfStatement(lineTokens: Token[], allTokens: Token[]) {
        let ifIndex = this.tokenIndexOf(TokenType.if, lineTokens);
        if (ifIndex === -1) {
            return false;
        }
        let thenIndex = this.tokenIndexOf(TokenType.then, lineTokens);
        let elseIndex = this.tokenIndexOf(TokenType.else, lineTokens);
        //if there's an else on this line, assume this is a one-line if statement
        if (elseIndex > -1) {
            return true;
        }
        //if there's no then, then it can't be a one line statement
        if (thenIndex === -1) {
            return false;
        }

        //see if there is anything after the "then". If so, assume it's a one-line if statement
        for (let i = thenIndex + 1; i < lineTokens.length; i++) {
            let token = lineTokens[i];
            if (
                token.tokenType === TokenType.whitespace ||
                token.tokenType === TokenType.newline
            ) {
                //do nothing with whitespace and newlines
            } else {
                //we encountered a non whitespace and non newline token, so this line must be a single-line if statement
                return true;
            }
        }
        return false;
    }
}

/**
 * A set of formatting options used to determine how the file should be formatted.
 */
export interface FormattingOptions {
    /**
     * The type of indentation to use when indenting the beginning of lines.
     */
    indentStyle?: 'tabs' | 'spaces' | 'existing';
    /**
     * The number of spaces to use when indentStyle is 'spaces'. Default is 4
     */
    indentSpaceCount?: number;
    /**
     * Replaces all keywords with the upper or lower case settings specified.
     * If set to null, they are not modified at all.
     */
    keywordCase?: 'lower' | 'upper' | 'title' | null;
    /**
     * Forces all composite keywords (i.e. "elseif", "endwhile", etc...) to be consistent.
     * If 'split', they are split into their alternatives ("else if", "end while").
     * If 'combine', they are combined ("elseif", "endwhile").
     * If null, they are not modified.
     */
    compositeKeywords?: 'split' | 'combine' | null;
    /**
     * If true (the default), trailing white space is removed
     * If false, trailing white space is left intact
     */
    removeTrailingWhiteSpace?: boolean;
}
