// For tests only.

/** A one-page PDF that says `text` (Helvetica, no compression; ASCII only). */
export function samplePdf(text: string) {
	const stream = `BT /F1 12 Tf 20 50 Td (${text}) Tj ET`;
	return Buffer.from(
		[
			'%PDF-1.4',
			'1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
			'2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
			'3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 100]/Contents 4 0 R' +
				'/Resources<</Font<</F1 5 0 R>>>>>>endobj',
			`4 0 obj<</Length ${stream.length}>>stream`,
			stream,
			'endstream endobj',
			'5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj',
			'trailer<</Root 1 0 R>>',
			'%%EOF'
		].join('\n')
	);
}
