# Domain docs:mae 单上下文

- **术语表**:`docs/mae/GLOSSARY.md`——首个跨会话领域术语敲定时创建(懒创建)。mae 定制决策词汇以 `specs/mae/README.md` 决策总表(D1–D14)为准,GLOSSARY 只收录反复出现、需要统一用法的领域术语。
- **ADR**:`docs/mae/adr/`——独立编号从 0001 起,只收录 mae 定制决策(难逆转、无背景会意外、真实取舍三条全满足时才写)。上游 `docs/adr/`(0001–0004)是上游架构决策,作只读背景;mae 范围内与其冲突时,以 mae ADR 为准。
- **消费规则**:使用领域术语前先查 GLOSSARY;实现方案不得与生效 ADR 冲突;上游文档(`docs/`、各包 `AGENTS.md`)描述上游行为,涉及 mae 定制时以 `specs/mae/` 规格为先。
