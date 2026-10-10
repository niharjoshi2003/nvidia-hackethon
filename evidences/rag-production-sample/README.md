# Evidence: production RAG grade

A coach result kept so it can be opened again without re-running the models.

| File | What it is |
| --- | --- |
| [sample-response.md](sample-response.md) | The result text, including both model cards |
| [screenshots/](screenshots/) | The coach page, one image per analysis tab |
| [rag-production-sample.pdf](rag-production-sample.pdf) | The same page as a single document |

Reopen the page locally:

```bash
npm run dev
```

Then open [http://localhost:5173/evidence/rag-production-sample](http://localhost:5173/evidence/rag-production-sample).

The route is not in the nav. Hide the blue note before comparing the page with the screenshots; the shots were taken after that note was hidden.

Regenerate the images from a running dev server:

```bash
npm run evidence:capture
```
