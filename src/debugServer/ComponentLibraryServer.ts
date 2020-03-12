import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import * as url from 'url';

import { util } from './util';

export class ComponentLibraryServer {

    public componentLibrariesOutDir: string;

    private server: http.Server;

    public async startStaticFileHosting(componentLibrariesOutDir: string, port: number, sendDebugLogLine) {

        // Make sure the requested port is not already being used by another service
        if (await util.isPortInUse(port)) {
            throw new Error(`Could not host component library files.\nPort ${port} is currently occupied.`);
        }

        this.componentLibrariesOutDir = componentLibrariesOutDir;

        // #region prepare static file hosting
        // maps file extension to MIME types
        const mimeType = {
            '.ico': 'image/x-icon',
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.json': 'application/json',
            '.css': 'text/css',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.wav': 'audio/wav',
            '.mp3': 'audio/mpeg',
            '.svg': 'image/svg+xml',
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.eot': 'appliaction/vnd.ms-fontobject',
            '.ttf': 'aplication/font-sfnt',
            '.zip': 'application/zip'
        };

        this.server = http.createServer((req, res) => {
            sendDebugLogLine(`${req.method} ${req.url}`);

            // parse URL
            const parsedUrl = url.parse(req.url);

            // extract URL path
            // Avoid https://en.wikipedia.org/wiki/Directory_traversal_attack
            // e.g curl --path-as-is http://localhost:9000/../fileInDanger.txt
            // by limiting the path to component libraries out directory only
            const sanitizePath = path.normalize(parsedUrl.pathname).replace(/^(\.\.[\/\\])+/, '');
            let pathname = path.join(this.componentLibrariesOutDir, sanitizePath);

            fs.exists(pathname, function(exist) {
                if (!exist) {
                    // if the file is not found, return 404
                    res.statusCode = 404;
                    res.end(`File ${pathname} not found!`);
                    return;
                }

                // if is a directory
                // if (fs.statSync(pathname).isDirectory()) {
                // TODO: add support for directory listing
                // }

                // read file from file system
                fs.readFile(pathname, function(err, data) {
                    if (err) {
                        res.statusCode = 500;
                        res.end(`Error getting the file: ${err}.`);
                    } else {
                        // based on the URL path, extract the file extension. e.g. .js, .doc, ...
                        const ext = path.parse(pathname).ext;
                        // if the file is found, set Content-type and send data
                        res.setHeader('Content-type', mimeType[ext] || 'text/plain');
                        res.end(data);
                    }
                });
            });

        }).listen(port);

        sendDebugLogLine(`Server listening on port ${port}`);
        // #endregion

        // #region print possible IP addresses that may be the users local ip
        let ifaces = os.networkInterfaces();
        Object.keys(ifaces).forEach((ifname) => {
            let alias = 0;

            ifaces[ifname].forEach((iface) => {
                if ('IPv4' !== iface.family || iface.internal !== false) {
                    // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
                    return;
                }

                sendDebugLogLine(`Potential target ip for component libraries: ${iface.address}`);
            });
        });
        // #endregion
    }

    /**
     * Stop the server (if it's running)
     */
    public stop() {
        if (this.server) {
            this.server.close();
        }
    }
}
