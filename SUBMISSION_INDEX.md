# Submission Index

Read and review the submission in this order:

1. [README.md](README.md) - run instructions, deployment notes, and the equipment/bookings schema.
2. [API_CONTRACT.md](API_CONTRACT.md) - endpoints, request fields, status codes, and request examples.
3. [AI_LOG.md](AI_LOG.md) - AI assistance and verification record.
4. [QUALITY_GATE_REVIEW.md](QUALITY_GATE_REVIEW.md) - findings, actions, evidence, and remaining submission caveats.
5. [TEST_EVIDENCE.md](TEST_EVIDENCE.md) - local and deployed Base API URLs with more than five test cases.
6. `src/`, `migrations/`, `test/`, `scripts/`, and `public/` - runnable implementation, database migration, tests, smoke test, and browser tester.

Install dependencies with `npm install`, then follow the run and verification commands in `README.md`. The Quality Gate review discloses that the historical pre-30-minute checkpoint was not captured; confirm with the instructor how to handle that requirement before submitting.