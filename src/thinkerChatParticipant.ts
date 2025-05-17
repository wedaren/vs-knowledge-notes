import * as vscode from 'vscode';

export const THINKER_PROMPT =
    '我们一起来探讨一个问题，请帮我理清思路。\
在接下来的对话中，请你先不要主动回答或提供信息。\
只有当我明确向你提出问题（例如，以问号结尾的句子直接问你），或者在我陈述完我的想法后，\
用诸如‘你觉得呢？’、‘你认为这个想法如何？’、‘请给我一些反馈’等方式明确征求你的意见时，你再回答。';

export const thinkerHandler: vscode.ChatRequestHandler = async (
   request: vscode.ChatRequest,
   context: vscode.ChatContext,
   stream: vscode.ChatResponseStream,
   token: vscode.CancellationToken
): Promise<vscode.ChatResult | undefined> => {
   const messages: vscode.LanguageModelChatMessage[] = [
      vscode.LanguageModelChatMessage.User(THINKER_PROMPT),
   ];

   //get all the previous participant messages
   const previousMessages = context.history.filter(
      (h): h is vscode.ChatResponseTurn => h instanceof vscode.ChatResponseTurn
   );
   //add the previous messages to the messages array
   previousMessages.forEach(m => {
      let fullMessage = '';
      m.response.forEach((r: vscode.ChatResponsePart) => {
         if (r instanceof vscode.ChatResponseMarkdownPart) {
            fullMessage += r.value.value;
         }
      });
      messages.push(vscode.LanguageModelChatMessage.Assistant(fullMessage));
   });

   //Add current user prompt
   messages.push(vscode.LanguageModelChatMessage.User(request.prompt));

   const chatResponse = await request.model.sendRequest(messages, {}, token);
   for await (const fragment of chatResponse.text) {
      stream.markdown(fragment);
   }
   return;
};
