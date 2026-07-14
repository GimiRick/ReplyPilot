const fs = require('fs');
const path = require('path');

const binDir = path.join(__dirname, '..', 'node_modules', '.bin');

let fixed = 0;
for (const file of ['tsc', 'tsc.cmd', 'tsc.ps1']) {
    const filePath = path.join(binDir, file);
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        const updated = content.replace(/@typescript[\\/]old/g, 'typescript-7');
        if (content !== updated) {
            fs.writeFileSync(filePath, updated, 'utf8');
            fixed++;
        }
    } catch {
        // skip if file doesn't exist
    }
}

if (fixed) {
    console.log(`patched ${fixed} tsc bin file(s) to use typescript-7`);
}
