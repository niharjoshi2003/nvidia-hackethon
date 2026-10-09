# Token Factory spike (recorded run)

Base URL: `https://api.tokenfactory.nebius.com/v1`

| Setting | Value |
| --- | --- |
| `NEMOTRON_NANO` | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` |
| `NEMOTRON_ULTRA` | `nvidia/Nemotron-3-Ultra-550b-a55b` |
| Latency per grade (one spike run) | 7693 ms |
| Tokens per grade | 866 in / 1605 out |

Reproduce: `npm run spike` with `TOKEN_FACTORY_API_KEY` in `.env`.
