const http = require('http');
const { spawn } = require('child_process');

const queries = [
    '/api/profiles?gender=male&country_id=NG&min_age=25',
    '/api/profiles?sort_by=age&order=desc',
    '/api/profiles/search?q=young%20males%20from%20nigeria',
    '/api/profiles/search?q=females%20above%2030',
    '/api/profiles/search?q=people%20from%20angola',
    '/api/profiles/search?q=adult%20males%20from%20kenya',
    '/api/profiles/search?q=male%20and%20female%20teenagers%20above%2017',
    '/api/profiles/search?q=unparseable%20gibberish%20query'
];

async function fetchURL(path) {
    return new Promise((resolve) => {
        http.get('http://localhost:3000' + path, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({status: res.statusCode, body: JSON.parse(data)}));
        }).on('error', (e) => resolve({error: e.message}));
    });
}

const server = spawn('node', ['index.js'], { cwd: __dirname });

server.stdout.on('data', (data) => console.log(`Server: ${data}`));
server.stderr.on('data', (data) => console.error(`Server Error: ${data}`));

setTimeout(async () => {
    for (const q of queries) {
        console.log("\\n--- Testing:", q);
        const result = await fetchURL(q);
        if (result.error) {
            console.error("ERROR:", result.error);
        } else {
            console.log("Status:", result.status);
            console.log("Total returned:", result.body.total);
            console.log("Message:", result.body.message || "None");
        }
    }
    server.kill();
    process.exit(0);
}, 2000);
