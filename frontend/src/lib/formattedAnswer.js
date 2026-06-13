const LIST_LINE =
  /^(?:[①②③④⑤⑥⑦⑧⑨⑩⑪⑫]|[(（]?\d+[)）]?|\d+[.)])\s*(.*)$/u;

export function parseAnswerContent(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const blocks = [];
  let paragraphLines = [];
  let listItems = [];

  const pushParagraph = () => {
    const merged = paragraphLines.join(" ").replace(/\s+/g, " ").trim();
    if (merged) blocks.push({ type: "paragraph", text: merged });
    paragraphLines = [];
  };

  const pushList = () => {
    if (listItems.length) {
      blocks.push({ type: "list", items: [...listItems] });
      listItems = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      pushList();
      pushParagraph();
      continue;
    }

    const match = trimmed.match(LIST_LINE);
    if (match) {
      pushParagraph();
      listItems.push((match[1] || trimmed).trim());
      continue;
    }

    if (listItems.length > 0 && paragraphLines.length === 0) {
      listItems[listItems.length - 1] = `${listItems[listItems.length - 1]} ${trimmed}`.trim();
      continue;
    }

    pushList();
    paragraphLines.push(trimmed);
  }

  pushList();
  pushParagraph();
  return blocks;
}

export function countAnswerWords(text) {
  return String(text ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}
