import { START, StateGraph } from "@langchain/langgraph";
import { ToolNode } from '@langchain/langgraph/prebuilt'
import { AgentState } from "../../types/Types";
import { agentTools } from "../tools/BasicInfoTools";
import { callModel, shouldContinue } from "../tool_nodes/BasicNode";


const toolNodes = new ToolNode<typeof AgentState.State>(agentTools);

const workflow = new StateGraph(AgentState)
  .addNode("agent", callModel)
  .addNode("tools", toolNodes)
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