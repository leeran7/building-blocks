A quality gate is not a gate until it has been proven to fail. Before trusting
lint, typecheck, tests, or audit, feed a deliberately violating input and
confirm the command goes red.

Never assert behaviour by grepping source text. Invoke the unit and assert its
output. Reject any test whose only failure mode is a rename.

Do not re-implement production logic in a test. Export the function and import
it. A diverged copy will assert the inverse of production and still pass.

Before testing a module, confirm it has a non-test caller. Tests on a file that
only the test imports prove nothing.

Prove every negative guard against a positive fixture of the string or input it
must reject.
