const https = require('https');
https.get('https://podsy.pro', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const match = data.match(/assets\/index-[^"']+\.js/);
        if (match) {
            https.get('https://podsy.pro/' + match[0], (res2) => {
                let jsData = '';
                res2.on('data', chunk => jsData += chunk);
                res2.on('end', () => {
                    const clientMatch = jsData.match(/client_id[:=]\s*["']([^"']+)["']/i) || jsData.match(/["']([a-zA-Z0-9-]+\.apps\.googleusercontent\.com)["']/g);
                    console.log('Found client IDs in bundle:', clientMatch);
                });
            });
        }
    });
});
