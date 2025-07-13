import { START, StateGraph } from "@langchain/langgraph";
import { AgentState } from "../../types/Types";
import { callModel, shouldContinue, executeTools } from "../tool_nodes/BasicNode";

const workflow = new StateGraph(AgentState)
  .addNode("agent", callModel)
  .addNode("tools", executeTools)
  .addEdge(START, "agent")
  .addConditionalEdges(
    "agent",
    shouldContinue,
  )
  .addEdge("tools", "agent");

// Finally, we compile it!
// This compiles it into a LangChain Runnable,
// meaning you can use it as you would any other runnable
export const app = workflow.compile();
