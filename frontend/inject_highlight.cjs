const fs = require('fs');
const path = require('path');

const dir = '/Users/kerven/Desktop/astracodex/frontend/src/data/content/mathematics/lesson-1';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

const scriptToInject = `
  <script>
    window.addEventListener('message', function(event) {
      const data = event.data;
      if (!data || (data.type !== 'SHOW_COMPONENT' && data.type !== 'CLICK_COMPONENT')) return;

      const name = data.name || '';
      let el = document.getElementById(data.id);

      if (!el && name) {
        const valMatch = name.match(/(-?\\d+(\\.\\d+)?)/);
        const val = valMatch ? valMatch[0] : null;
        
        const lowerName = name.toLowerCase();
        if (lowerName.includes('drop point') && val) {
          el = document.querySelector('.drop-point[data-value="' + val + '"]');
        } else if (lowerName.includes('number card') && val) {
          el = document.querySelector('.number-card[data-value="' + val + '"]');
        } else if (lowerName.includes('reset')) {
          el = document.getElementById('reset-button') || document.querySelector('.reset-button');
        } else if (lowerName.includes('check')) {
          el = document.getElementById('check-answer-button') || document.querySelector('.check-answer-button');
        } else if (lowerName.includes('natural')) {
          el = document.querySelector('.bucket[data-target="natural"]');
        } else if (lowerName.includes('whole')) {
          el = document.querySelector('.bucket[data-target="whole"]');
        } else if (lowerName.includes('integer')) {
          el = document.querySelector('.bucket[data-target="integer"]');
        } else if (lowerName.includes('rational')) {
          el = document.querySelector('.bucket[data-target="rational"]');
        } else if (lowerName.includes('irrational')) {
          el = document.querySelector('.bucket[data-target="irrational"]');
        } else if (lowerName.includes('real')) {
          el = document.querySelector('.bucket[data-target="real"]');
        }
      }

      if (el) {
        const oldOutline = el.style.outline;
        const oldOutlineOffset = el.style.outlineOffset;
        const oldBoxShadow = el.style.boxShadow;
        
        el.style.outline = '4px solid #3b82f6';
        el.style.outlineOffset = '4px';
        el.style.boxShadow = '0 0 15px rgba(59, 130, 246, 0.5)';
        
        setTimeout(() => {
          el.style.outline = oldOutline;
          el.style.outlineOffset = oldOutlineOffset;
          el.style.boxShadow = oldBoxShadow;
        }, 2000);

        if (data.type === 'CLICK_COMPONENT') {
          setTimeout(() => el.click(), 500);
        }
      }
    });
  </script>
</body>
`;

files.forEach(file => {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf-8');
  if (!content.includes("window.addEventListener('message'")) {
    content = content.replace('</body>', scriptToInject);
    fs.writeFileSync(filePath, content);
    console.log('Injected into ' + file);
  }
});
