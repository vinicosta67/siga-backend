export const analyzeXCurve = async (req, res) => {
    try {
        const { cpf, cnpj, token } = req.body;
        
        const apiUrl = process.env.XCURVE_API_URL || "https://tm-xcurve-api-bcbqgndsbhd0edc0.centralus-01.azurewebsites.net/xcurve/analyze";
        
        // Pega o token enviado pelo payload, mas se não vier usa o AZURE_JWT_STRING
        let finalToken = token || process.env.AZURE_JWT_STRING || "9f8a3c2b7d4e6f1a0b5c8d2e7f9a1c3b";
        
        if (finalToken) {
            finalToken = finalToken.replace(/"/g, ''); // Limpando aspas acidentais se existirem no .env
        }
        
        const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify({
                token: finalToken,
                cpf: cpf || "",
                cnpj: cnpj || ""
            })
        });

        if (!response.ok) {
            const text = await response.text();
            console.error("XCurve Error Response:", text);
            return res.status(response.status).json({ error: "Failed to fetch from XCurve API", details: text });
        }

        const data = await response.json();
        res.json(data);
    } catch (e) {
        console.error("XCurve error:", e);
        res.status(500).json({ error: e.message });
    }
};
