# Thesis: in two years the unit of AI output is not the message

As I read it, AI products today ship fluent prose with citations attached. A citation shows that a document exists, not that it says the sentence beside it, and nothing re-runs the check.

**The claim, stated so it can be wrong.** Within two years at least one regulator, standard or large procurement requirement will demand that AI-generated figures in a defined class of documents ship with machine-re-derivable support, and products that can offer only prose will be excluded on that basis.

**Why believe it.** As I read it, the first serious buyers, in finance, logistics and legal operations, cannot audit prose, and will ask for what an auditor can hold: a claim, the evidence it rests on, and a way for someone who does not trust the vendor to re-derive it.

**What would falsify it.** Citation-plus-judge faithfulness checks prove good enough that buyers accept them. Or the checkable fragment is too narrow to cover what buyers need, so that a closed claim language like this one is a toy, not a seed.

**What this repository shows.** One closed fragment, integer ranges over sums, ruled by a deterministic gate, with its limits pinned by a failure suite. It does not show the prediction is right. It does not check that a typed observation matches the document it was read from: when the extraction is wrong, the gate rules a false claim entailed (case 01 in `tests/failures`). A re-derivable answer is not a complete or authentic one: `recheck` cannot see a bound dropped together with its support (case 02). Evidence has no clock (case 07), and no source outranks another (case 08). Those would belong to other layers, and nothing here builds them.
