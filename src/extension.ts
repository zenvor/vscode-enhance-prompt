import * as vscode from 'vscode';
import fetch from 'node-fetch';

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    'enhancePrompt.enhance',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('没有检测到活动编辑器。');
        return;
      }

      const selection = editor.selection;
      const rawText = editor.document.getText(selection) || editor.document.getText();
      if (!rawText.trim()) {
        vscode.window.showWarningMessage('请先选择文本或确保文件非空。');
        return;
      }

      const cfg = vscode.workspace.getConfiguration('enhancePrompt');
      const apiKey = (cfg.get<string>('deepseekApiKey') || process.env.DEEPSEEK_API_KEY || '').trim();
      if (!apiKey) {
        vscode.window.showErrorMessage('请在设置中配置 DeepSeek API Key 或设置环境变量 DEEPSEEK_API_KEY。');
        return;
      }

      try {
        const enhanced = await callDeepSeek({
          apiKey,
          model: cfg.get<string>('model') || 'deepseek-chat',
          temperature: cfg.get<number>('temperature') ?? 0.2,
          rawText
        });

        editor.edit(editBuilder => {
          if (selection.isEmpty) {
            // 替换整个文件
            const fullRange = new vscode.Range(
              editor.document.positionAt(0),
              editor.document.positionAt(editor.document.getText().length)
            );
            editBuilder.replace(fullRange, enhanced);
          } else {
            editBuilder.replace(selection, enhanced);
          }
        });
        vscode.window.showInformationMessage('Enhance Prompt: 已生成并替换。');
      } catch (err: any) {
        vscode.window.showErrorMessage(`DeepSeek 调用失败：${err.message}`);
      }
    }
  );

  context.subscriptions.push(disposable);
}

interface DeepSeekParams {
  apiKey: string;
  model: string;
  temperature: number;
  rawText: string;
}

async function callDeepSeek(params: DeepSeekParams): Promise<string> {
  const { apiKey, model, temperature, rawText } = params;

  const systemPrompt =
    '你是一名资深需求分析师，请将给出的原始“口语化”需求增强为结构化、Markdown 格式的开发任务说明。';
  const userPrompt = `<<<原始描述>>>\n${rawText}\n<<<输出要求>>> \n1. 先用一句话概括改动范围；\n2. 按模块添加二级标题；\n3. 每点以“**动作**：原因/目的”书写；\n4. 删除项说明原因；\n5. 结尾追加“技术实现要求”；\n请按 Markdown 输出。`;

  const body = {
    model,
    temperature,
    stream: false,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  };

  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} - ${res.statusText}`);
  }

  const json = (await res.json()) as {
    choices: { message: { content: string } }[];
  };

  return json.choices[0].message.content.trim();
}

export function deactivate() {}
