"""Platform entry points for the action agent, supervisor, and approval.

// NOTE: C3 LLM integration is not configured here. generatePlan validates model
// output and stores the required fallback. Approve and reject are limited to
// the ApprovePlan action group and change only status, decidedBy, and decidedAt.
"""


def generatePlan(cls, riskScoreId):
    raise RuntimeError("Use replay/catalog.py in this workspace")


def runSupervisor(cls, asOf):
    raise RuntimeError("Use replay/catalog.py in this workspace")


def approvePlan(cls, planId):
    raise RuntimeError("Use replay/server.py in this workspace")


def rejectPlan(cls, planId, reason):
    # reason is not stored; ActionPlan has no reason field.
    raise RuntimeError("Use replay/server.py in this workspace")
