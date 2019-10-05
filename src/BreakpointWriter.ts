import * as eol from 'eol';
import { SourceNode } from 'source-map';
import { DebugProtocol } from 'vscode-debugprotocol';

import { fileUtils } from './FileUtils';

export class BreakpointWriter {

    private bpIndex = 1;
    public writeBreakpointsWithSourcemaps(fileContents: string, originalFilePath: string, breakpoints: DebugProtocol.SourceBreakpoint[]) {
        let chunks = [] as Array<SourceNode | string>;

        //split the file by newline
        let lines = eol.split(fileContents);

        for (let originalLineIndex = 0; originalLineIndex < lines.length; originalLineIndex++) {
            let line = lines[originalLineIndex];
            let isFinalLine = originalLineIndex === lines.length - 1;
            let newline = isFinalLine ? '' : '\n';
            //find breakpoints for this line (breakpoints are 1-indexed)
            let lineBreakpoints = breakpoints.filter(bp => bp.line - 1 === originalLineIndex);
            //if we have a breakpoint, insert that before the line
            for (let bp of lineBreakpoints) {
                let breakpointLines = this.getBreakpointLines(bp);
                for (let bpLine of breakpointLines) {
                    //this is new code not found in source, so we don't need to provide original location information
                    chunks.push(`${bpLine}${newline}`);
                }
            }

            //add the original code now
            chunks.push(
                //sourceNode expects 1-based row indexes
                new SourceNode(originalLineIndex + 1, 0, originalFilePath, `${line}${newline}`)
            );
        }

        let node = new SourceNode(null, null, originalFilePath, chunks);
        return node.toStringWithSourceMap();
    }

    public getBreakpointLines(breakpoint: DebugProtocol.SourceBreakpoint) {
        let lines = [];
        if (breakpoint.condition) {
            // add a conditional STOP statement
            lines.push(`if ${breakpoint.condition} then : STOP : end if`);
        } else if (breakpoint.hitCondition) {
            let hitCondition = parseInt(breakpoint.hitCondition);

            if (isNaN(hitCondition) || hitCondition === 0) {
                // add a STOP statement right before this line
                lines.push(`STOP`);
            } else {
                let prefix = `m.vscode_bp`;
                let bpName = `bp${this.bpIndex++}`;
                let checkHits = `if ${prefix}.${bpName} >= ${hitCondition} then STOP`;
                let increment = `${prefix}.${bpName} ++`;

                // Create the BrightScript code required to track the number of executions
                let trackingExpression = `
                    if Invalid = ${prefix} OR Invalid = ${prefix}.${bpName} then
                        if Invalid = ${prefix} then
                            ${prefix} = {${bpName}: 0}
                        else
                            ${prefix}.${bpName} = 0
                    else
                        ${increment} : ${checkHits}
                `;
                //coerce the expression into single-line
                trackingExpression = trackingExpression.replace(/\n/gi, '').replace(/\s+/g, ' ').trim();
                // Add the tracking expression right before this line
                lines.push(trackingExpression);
            }
        } else if (breakpoint.logMessage) {
            let logMessage = breakpoint.logMessage;
            //wrap the log message in quotes
            logMessage = `"${logMessage}"`;
            let expressionsCheck = /\{(.*?)\}/g;
            let match;

            // Get all the value to evaluate as expressions
            while (match = expressionsCheck.exec(logMessage)) {
                logMessage = logMessage.replace(match[0], `"; ${match[1]};"`);
            }

            // add a PRINT statement right before this line with the formated log message
            lines.push(`PRINT ${logMessage}`);
        } else {
            // add a STOP statement right before this line
            //TODO temporarily add extra newlines to help surface bugs in the sourcemap mapping code
            lines.push(`STOP`);
        }
        return lines;
    }
}
