// Фиксируем окно строго 320x470
figma.showUI(__html__, { width: 320, height: 470, themeColors: true });

async function loadSettings() {
  const savedKey = await figma.clientStorage.getAsync('gemini_api_key');
  const savedUrl = await figma.clientStorage.getAsync('local_url');
  const savedProvider = await figma.clientStorage.getAsync('active_provider');
  
  figma.ui.postMessage({ 
    type: 'settings-loaded', 
    apiKey: savedKey || "", 
    localUrl: savedUrl || "http://localhost:1234/v1",
    provider: savedProvider || "google-free"
  });
}

loadSettings();

function findAllTextNodes(nodes) {
  let textNodes = [];
  for (const node of nodes) {
    if (node.type === 'TEXT') {
      textNodes.push(node);
    } else if ('children' in node) {
      textNodes = textNodes.concat(findAllTextNodes(node.children));
    }
  }
  return textNodes;
}

const updateSelection = () => {
  const selection = figma.currentPage.selection;
  const textNodes = findAllTextNodes(selection);
  figma.ui.postMessage({ type: 'selection-change', count: textNodes.length });
};

figma.on("selectionchange", updateSelection);
updateSelection();

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'save-settings') {
    await figma.clientStorage.setAsync('gemini_api_key', msg.apiKey);
    await figma.clientStorage.setAsync('local_url', msg.localUrl);
    await figma.clientStorage.setAsync('active_provider', msg.provider);
  }

if (msg.type === 'run-translation') {
    const textNodes = findAllTextNodes(figma.currentPage.selection);
    if (textNodes.length === 0) {
      figma.notify("Выберите текстовые слои");
      return;
    }
    const payload = textNodes.map(node => ({ id: node.id, text: node.characters }));
    
    // Передаем параметры по старинке, без оператора '...'
    figma.ui.postMessage({ 
      type: 'start-api-call', 
      payload: payload,
      target: msg.target,
      apiKey: msg.apiKey,
      localUrl: msg.localUrl,
      provider: msg.provider
    });
  }

  if (msg.type === 'apply-data') {
    try {
      for (const item of msg.results) {
        const node = await figma.getNodeByIdAsync(item.id);
        if (node && node.type === 'TEXT') {
          
          // Безопасная загрузка шрифтов с учетом figma.mixed
          let fontToLoad = node.fontName;
          if (fontToLoad === figma.mixed) {
            fontToLoad = node.getRangeFontName(0, 1); // Берем шрифт первого символа
            await figma.loadFontAsync(fontToLoad);
            // Приводим весь текст к одному шрифту, чтобы избежать краша
            node.setRangeFontName(0, node.characters.length, fontToLoad);
          } else {
            await figma.loadFontAsync(fontToLoad);
          }
          
          node.characters = item.translatedText;
        }
      }
      figma.ui.postMessage({ type: 'apply-data-success' });
      figma.notify("Перевод успешно применен");
    } catch (err) {
      console.error("Figma API Error (Fonts/Text):", err);
      figma.ui.postMessage({ type: 'error' });
      figma.notify("Ошибка при обновлении текста. Проверьте консоль.");
    }
  }
};