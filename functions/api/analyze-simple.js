export async function onRequestPost(context) {
    try {
        const apiKey = context.env.GEMINI_API_KEY;
        if (!apiKey) {
            return new Response(JSON.stringify({ success: false, error: 'Server Config Error: GEMINI_API_KEY is missing' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const formData = await context.request.formData();
        const image = formData.get('image');

        if (!image || !(image instanceof File)) {
            return new Response(JSON.stringify({ success: false, error: '請上傳圖片' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const arrayBuffer = await image.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
            binary += String.fromCharCode.apply(null, uint8Array.slice(i, i + chunkSize));
        }
        const base64Image = btoa(binary);

        const promptText = `你是一個訂單識別專家。請分析這張「銷貨單報表-送貨公司聯」圖片，精確提取資訊：

**重要規則**：
- 商品只從主表格識別，不要從右側收據副聯重複識別
- 每個商品只出現一次
- itemCode 必須從「Barcode Item/SubCode」欄位識別，優先取較短的9碼數字

**識別區域**：
1. **編號區**: 
   - bookingNo: Booking No. 欄位的訂貨編號
   - invoiceNo: Invoice No. 欄位的發票號碼
2. **店點資訊**: Selling Store 欄位的店別名稱
3. **表格明細區**: 
   - itemCode: 從「Barcode Item/SubCode」欄位識別，每行可能有2個代碼，取9碼的那個
   - itemName: 從「Item Name/Sub Code Name」欄位識別完整品名
   - quantity: 從「Booking Qty」欄位識別訂貨數量
4. **日期時間**: Booking Date 欄位

請以 JSON 格式回傳:
{
  "bookingNo": "訂貨編號或null",
  "invoiceNo": "發票號碼或null",
  "store": "店別",
  "datetime": "日期時間",
  "items": [
    { "itemCode": "9碼代碼", "itemName": "品名", "quantity": 1 }
  ]
}`;

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: promptText },
                        { inline_data: { mime_type: image.type, data: base64Image } }
                    ]
                }],
                generationConfig: {
                    temperature: 0,
                    response_mime_type: "application/json"
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API Error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();

        if (!result.candidates || result.candidates.length === 0) {
            throw new Error('No candidates returned from Gemini');
        }

        const text = result.candidates[0].content.parts[0].text;
        const cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const data = JSON.parse(cleanedText);

        return new Response(JSON.stringify({ success: true, data }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (e) {
        return new Response(JSON.stringify({ success: false, error: e.message || '識別失敗' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
