# 調査知見

- ReactとReact DOMは解決後の完全versionを揃え、両型定義も同じPRで更新する。不一致はtest読込時点で失敗する。
- TypeScript 6は `@types` を自動取込しないため、共有HTTP型が使うNode型を直接依存とし、両tsconfigの `types: ["node"]` を維持する。TS7はtypescript-eslint対応まで上げない。
- `global-agent` overrideは旧 `@electron/get` 経由の未修正依存を除くために必要。公開 `bootstrap()` proxy経路も確認し、上流解消後にoverrideを再評価する。
- 自動merge後にmain CIが作成されないことがある。対象SHAのrunを確認し、なければmainへworkflowを明示起動する。
- Dependabot自動修復は読取り権限でlockfileだけを扱い、PRコードへ書込み権限や秘密を渡さない。
