const fs = require('fs');
const getImports = (filePath) => {
  try {
    const code = fs.readFileSync(filePath, 'utf8');
    const regex = /import\s+.*?\s+from\s+['\"'](.*?)['\"']/g;
    let match; const imports = [];
    while ((match = regex.exec(code)) !== null) {
      if (match[1].startsWith('.')) imports.push(match[1]);
    }
    return imports;
  } catch (e) { return []; }
};
console.log('App.tsx:', getImports('src/App.tsx'));
console.log('AppContext.tsx:', getImports('src/AppContext.tsx'));
console.log('main.tsx:', getImports('src/main.tsx'));
console.log('LandingPage.tsx:', getImports('src/LandingPage.tsx'));

