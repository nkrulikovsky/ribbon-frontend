import React, { useCallback, useMemo, useState } from "react";
import styled from "styled-components";
import moment from "moment";

import {
  VaultLiquidityMiningMap,
  VaultOptions,
} from "shared/lib/constants/constants";
import {
  BaseModalContentColumn,
  SecondaryText,
  Title,
} from "shared/lib/designSystem";
import { formatBigNumber } from "shared/lib/utils/math";
import { ActionButton } from "shared/lib/components/Common/buttons";
import { usePendingTransactions } from "shared/lib/hooks/pendingTransactionsContext";
import { useWeb3Context } from "shared/lib/hooks/web3Context";
import useLiquidityTokenMinter from "shared/lib/hooks/useLiquidityTokenMinter";
import RBNClaimModalContent from "shared/lib/components/Common/RBNClaimModalContent";
import { getVaultColor } from "shared/lib/utils/vault";
import BasicModal from "shared/lib/components/Common/BasicModal";
import { LiquidityGaugeV5PoolResponse } from "shared/lib/models/staking";
import { useLiquidityGaugeV5PoolData } from "shared/lib/hooks/web3DataContext";
import useLoadingText from "shared/lib/hooks/useLoadingText";
import TooltipExplanation from "shared/lib/components/Common/TooltipExplanation";
import HelpInfo from "shared/lib/components/Common/HelpInfo";
import colors from "shared/lib/designSystem/colors";
import { BigNumber } from "ethers";
import { calculateBoostedRewards } from "shared/lib/utils/governanceMath";
import { formatUnits } from "ethers/lib/utils";

const LogoContainer = styled.div<{ color: string }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 100px;
  background: ${(props) => props.color}29;
`;

const AssetTitle = styled(Title)`
  text-transform: none;
  font-size: 22px;
  line-height: 28px;
`;

const InfoColumn = styled(BaseModalContentColumn)`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const InfoData = styled(Title)`
  text-transform: none;
`;

interface ClaimActionModalProps {
  show: boolean;
  onClose: () => void;
  logo: React.ReactNode;
  vaultOption: VaultOptions;
  stakingPoolData?: LiquidityGaugeV5PoolResponse;

  // APYs
  apysLoading?: boolean;
  baseAPY: number;
  calculateBoostedMultipler: (stakedAmount: BigNumber) => number;
}

const ClaimActionModal: React.FC<ClaimActionModalProps> = ({
  show,
  onClose,
  logo,
  vaultOption,
  stakingPoolData,

  // APYs
  apysLoading,
  baseAPY,
  calculateBoostedMultipler,
}) => {
  const { provider } = useWeb3Context();
  const [step, setStep] = useState<"info" | "claim" | "claiming" | "claimed">(
    "info"
  );
  const { data: lg5Data, loading: lg5DataLoading } =
    useLiquidityGaugeV5PoolData(vaultOption);
  // vaultOption
  const minterContract = useLiquidityTokenMinter();
  const { addPendingTransaction } = usePendingTransactions();

  const loadingText = useLoadingText();

  const handleClose = useCallback(() => {
    onClose();
    if (step === "claim" || step === "claimed") {
      setStep("info");
    }
  }, [onClose, step]);

  const handleClaim = useCallback(async () => {
    const liquidityGaugeAddress = VaultLiquidityMiningMap.lg5[vaultOption];

    if (!minterContract || !stakingPoolData || !liquidityGaugeAddress) {
      return;
    }
    setStep("claim");

    try {
      const tx = await minterContract.mint(liquidityGaugeAddress);

      setStep("claiming");

      const txhash = tx.hash;

      addPendingTransaction({
        txhash,
        type: "rewardClaim",
        amount: formatBigNumber(stakingPoolData.claimableRbn, 18),
        stakeAsset: vaultOption,
      });

      await provider.waitForTransaction(txhash, 2);
      setStep("claimed");
    } catch (err) {
      setStep("info");
    }
  }, [
    addPendingTransaction,
    provider,
    stakingPoolData,
    minterContract,
    vaultOption,
  ]);

  const timeTillNextRewardWeek = useMemo(() => {
    if (lg5DataLoading) {
      return loadingText;
    }

    if (!lg5Data) {
      return "---";
    }

    const endStakeReward = moment.unix(lg5Data.periodEndTime);

    if (endStakeReward.diff(moment()) <= 0) {
      return "Program Ended";
    }

    // Time till next stake reward date
    const startTime = moment.duration(
      endStakeReward.diff(moment()),
      "milliseconds"
    );

    return `${startTime.days()}D ${startTime.hours()}H ${startTime.minutes()}M`;
  }, [lg5Data, lg5DataLoading, loadingText]);

  const rewards: {
    totalPoolRewards: JSX.Element | string;
    baseRewards: JSX.Element | string;
    boostedRewardsMultiplier: JSX.Element | string;
    boostedRewardsAmount: JSX.Element | string;
  } = useMemo(() => {
    if (apysLoading) {
      return {
        totalPoolRewards: loadingText,
        baseRewards: loadingText,
        boostedRewardsMultiplier: "",
        boostedRewardsAmount: loadingText,
      };
    }

    const totalPoolRewards = lg5Data
      ? formatBigNumber(lg5Data.poolRewardForDuration)
      : undefined;
    const boost = calculateBoostedMultipler(
      lg5Data?.currentStake || BigNumber.from(0)
    );
    const boostPercentage = calculateBoostedRewards(baseAPY, boost);

    // Split unclaimed RBN into its share of base rewards and boosted rewards
    let baseRewards = "---";
    let boostedRewards = "---";
    if (stakingPoolData) {
      const totalPercentage = boostPercentage + baseAPY;
      const unclaimedRbn = parseFloat(
        formatUnits(stakingPoolData.claimableRbn, 18)
      );
      baseRewards = totalPercentage
        ? ((unclaimedRbn * baseAPY) / totalPercentage).toLocaleString(
            undefined,
            { maximumFractionDigits: 2 }
          )
        : "0";
      boostedRewards = totalPercentage
        ? ((unclaimedRbn * boostPercentage) / totalPercentage).toLocaleString(
            undefined,
            { maximumFractionDigits: 2 }
          )
        : "0";
    }

    return {
      totalPoolRewards:
        totalPoolRewards === undefined ? "-" : `${totalPoolRewards} RBN`,
      baseRewards,
      boostedRewardsMultiplier: boost ? `(${boost.toFixed(2)}X)` : "",
      boostedRewardsAmount: boostedRewards,
    };
  }, [
    loadingText,
    lg5Data,
    apysLoading,
    baseAPY,
    calculateBoostedMultipler,
    stakingPoolData,
  ]);

  const body = useMemo(() => {
    const color = getVaultColor(vaultOption);
    const labelColor = colors.tertiaryText;

    switch (step) {
      case "info":
        return (
          <>
            <BaseModalContentColumn>
              <LogoContainer color={color}>{logo}</LogoContainer>
            </BaseModalContentColumn>
            <BaseModalContentColumn marginTop={16}>
              <AssetTitle>{vaultOption}</AssetTitle>
            </BaseModalContentColumn>
            <InfoColumn marginTop={24}>
              <SecondaryText color={color}>Unclaimed RBN</SecondaryText>
              <InfoData color={color}>
                {stakingPoolData
                  ? formatBigNumber(stakingPoolData.claimableRbn, 18)
                  : 0}
              </InfoData>
            </InfoColumn>

            <InfoColumn marginTop={8}>
              <div className="d-flex align-items-center">
                <SecondaryText
                  className="ml-2"
                  fontSize={12}
                  color={labelColor}
                >
                  Base Rewards
                </SecondaryText>
                <TooltipExplanation
                  title="Base Rewards"
                  explanation="The rewards for staking rTokens."
                  renderContent={({ ref, ...triggerHandler }) => (
                    <HelpInfo containerRef={ref} {...triggerHandler}>
                      i
                    </HelpInfo>
                  )}
                />
              </div>
              <InfoData color={labelColor}>{rewards.baseRewards}</InfoData>
            </InfoColumn>
            <InfoColumn marginTop={8}>
              <div className="d-flex align-items-center">
                <SecondaryText
                  className="ml-2"
                  fontSize={12}
                  color={labelColor}
                >
                  Boosted Rewards {rewards.boostedRewardsMultiplier}
                </SecondaryText>
                <TooltipExplanation
                  title="Boosted Rewards"
                  explanation="The additional rewards veRBN holders earn for staking their rTokens. Base rewards can be boosted by up to 2.5X."
                  renderContent={({ ref, ...triggerHandler }) => (
                    <HelpInfo containerRef={ref} {...triggerHandler}>
                      i
                    </HelpInfo>
                  )}
                />
              </div>
              <InfoData color={labelColor}>
                {rewards.boostedRewardsAmount}
              </InfoData>
            </InfoColumn>

            <InfoColumn>
              <SecondaryText color={labelColor}>
                Time Till Next Reward
              </SecondaryText>
              <InfoData>{timeTillNextRewardWeek}</InfoData>
            </InfoColumn>
            <InfoColumn>
              <div className="d-flex align-items-center">
                <SecondaryText color={labelColor}>
                  Total Pool Rewards
                </SecondaryText>
              </div>
              <InfoData>{rewards.totalPoolRewards}</InfoData>
            </InfoColumn>

            <BaseModalContentColumn>
              <ActionButton
                className="btn py-3 mb-2"
                onClick={handleClaim}
                color={color}
                disabled={
                  !stakingPoolData || stakingPoolData.claimableRbn.isZero()
                }
              >
                ClAIM REWARDS
              </ActionButton>
            </BaseModalContentColumn>
          </>
        );
      default:
        return <RBNClaimModalContent step={step} type="rbn" />;
    }
  }, [
    step,
    logo,
    timeTillNextRewardWeek,
    vaultOption,
    stakingPoolData,
    handleClaim,
    rewards,
  ]);

  return (
    <BasicModal
      show={show}
      onClose={handleClose}
      height={step === "info" ? 436 : 580}
      animationProps={{
        key: step,
        transition: {
          duration: 0.25,
          type: "keyframes",
          ease: "easeInOut",
        },
        initial:
          step === "info" || step === "claim"
            ? {
                x: 50,
                opacity: 0,
              }
            : {},
        animate:
          step === "info" || step === "claim"
            ? {
                x: 0,
                opacity: 1,
              }
            : {},
        exit:
          step === "info"
            ? {
                x: -50,
                opacity: 0,
              }
            : {},
      }}
    >
      {body}
    </BasicModal>
  );
};

export default ClaimActionModal;
