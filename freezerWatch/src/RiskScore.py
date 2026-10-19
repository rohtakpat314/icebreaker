"""Platform entry points. The checked implementation is replay/risk_rules.py.

// NOTE: this workspace has no C3 runtime, so RiskScore.computeRisk and
// runRiskAgent are executed by replay/catalog.py against the Phase 0 CSVs.
"""


def computeRisk(cls, buildingId, asOf):
    raise RuntimeError("Use replay/catalog.py in this workspace")


def runRiskAgent(cls, asOf):
    raise RuntimeError("Use replay/catalog.py in this workspace")
